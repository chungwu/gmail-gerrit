function loadRb(id) {
  function callback(data) {
    rbId = id;
    data = $.parseJSON(data);
    console.log("RB", data);

    var status = isApproved(data) ? "approved" : "unapproved";
    console.log("STATUS", status);
    chrome.extension.sendRequest({type: "showRbAction", rbId: id, status: status});

    $sidebarBoxes = $("div[role='main'] .nH.anT .nH");
    $rbBox.insertAfter($($sidebarBoxes[0]));
    $("a", $rbBox).prop("href", rbUrl + "/" + rbId);

    formatThread(data);
  }
  chrome.extension.sendRequest({type: "loadRb", rbId: id}, callback);
}

function formatThread(reviewData) {
  var $thread = $("div[role='main'] .nH.if");
  console.log("Formatting thread", $thread);

  function doFormat() {
    if (!rbId) {
      return;
    }
    $(".Bk", $thread).not(".gerrit-formatted").each(function() {
      formatCard($(this), reviewData);
    });
    setTimeout(doFormat, 1000);
  }
  doFormat();
}

function formatCard($card, reviewData) {
  var $msg = $($(".ii div", $card)[0]);
  var text = $msg.text();
  if (!$.trim(text)) {
    return;
  } else {
    console.log("Formatting card", $card);
  }
  if (text.indexOf("Gerrit-MessageType: newchange") >= 0) {
    formatNewChange($msg, text, reviewData);
  } else if (text.indexOf("Gerrit-MessageType: comment") >= 0) {
    formatComment($msg, text, reviewData);
  }
  $card.addClass("gerrit-formatted");
}

function formatNewChange($msg, text, reviewData) {
  var lines = text.split("\n");
  $msg.empty();
  var isDiff = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var $line = $("<span/>").text(line);

    if (line.indexOf("Change-Id:") == 0) {
      isDiff = true;
    } else if (line.indexOf("Gerrit-Change-Id:") == 0) {
      isDiff = false;
    }

    if (isDiff) {
      $line.css("fontFamily", "monospace");
      if (line.indexOf("+") == 0) { // is add
        $line.css("color", "green");
      } else if (line.indexOf("-") == 0) { // is remove
        $line.css("color", "red");
      }
      if (line.indexOf("diff --git") == 0) { // is new file
        $line.prepend("<br/>");
        $line.css("fontWeight", "bold");
      }
    }
    $line.append("<br/>");
    $msg.append($line);
  }
}

function formatComment($msg, text, reviewData) {
  var lines = text.split("\n");
  $msg.empty();
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var $line = $("<span/>").text(line);

    if (line.indexOf("Code-Review") > 0) { // is review label
      var color = line.indexOf("+2") >= 0 ? "green" : line.indexOf("-1") >= 0 ? "red" : line.indexOf("-2") >= 0 ? "red" : "inherit";
      $line.css("color", color);
      $line.css("fontSize", "1.5em");
      $line.css("fontWeight", "bold");
    }

    if (line.indexOf("File ") == 0) { // is file title
      $line.css({fontFamily: "monospace", fontSize: "1.3em", fontWeight: "bold"});
      $line.append("<br/>");
    }

    if (line.indexOf("Line ") == 0) { // is line diff
      $line.css("fontFamily", "monospace");
    }

    $line.append("<br/>");
    $msg.append($line);
  };
}

function isApproved(reviewData) {
  if (!reviewData.labels || !reviewData.labels['Code-Review'] || !reviewData.labels['Code-Review'].all || reviewData.labels['Code-Review'].all.length == 0) return false;
  var reviews = reviewData.labels['Code-Review'].all
  for (var i=0; i < reviews.length; i++) {
    if (reviews[i].value >= 2) {
      return true;
    }
  }
  return false;
}

function showRbAction(id) {
  rbId = id;
  chrome.extension.sendRequest({type: "showRbAction", rbId: id});

  $sidebarBoxes = $("div[role='main'] .nH.anT .nH");
  $rbBox.insertAfter($($sidebarBoxes[0]));
}

function hideRbAction() {
  rbId = null;
  chrome.extension.sendRequest({type: "hideRbAction"});

  $rbBox.detach();
}

function showNeedSetup() {
  chrome.extension.sendRequest({type: "showSetup"});
}

function viewDiff() {
  if (rbId) {
    chrome.extension.sendRequest({type: "viewDiff", rbId: rbId});
  }
}

function approve() {
  if (rbId) {
    chrome.extension.sendRequest(
      {type: "approve", rbId: rbId}, 
      function(success) {
        if (success) {
          alert("Approved!");
        }
      });
  }
}

function getRbUrl(callback) {
  chrome.extension.sendRequest({type: "rbUrl"}, callback);
}

var rbId = null;
var rbUrl = null;
var re_rgid = new RegExp(".*/(\\d+)$");
var $rbBox = $(
  "<div class='nH' style='padding-bottom: 20px'>" +
    "<div class='am6'></div>" + 
    "<h4 style='margin-bottom: 10px'>Gerrit</h4>" + 
    "<a class='view-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO' target='_blank_'>View</a>" +
  "</div>"
);

function initialize() {
  getRbUrl(function(url) { 
    rbUrl = url; 
    if (!rbUrl) {
      showNeedSetup();
      return;
    }
    $(window).hashchange(function() {
      setTimeout(checkRb, 100);
    });
    setTimeout(function() {
      $("body").keypress(handleKeyPress);
      checkRb();
    }, 3000);
  });
}

function extractRbIdFromUrl(url) {
  console.log("EXTRACTING from", url);
  var m = re_rgid.exec(url);
  if (m && m.length >= 2) {
    return m[1];
  }
  return null;
}

function extractRbId() {
  //var $canvas = $("#canvas_frame").contents();
  //var $thread = $("div[role='main']", $canvas);
  var $thread = $("div[role='main']");
  var $anchor = $("a[href*='" + rbUrl + "']", $thread);
  if ($anchor.length > 0) {
    var url = $anchor.attr("href");
    return extractRbIdFromUrl(url);
  } else {
    return null;
  }
}

function checkRb() {
  console.log("Checking rb...");
  var id = extractRbId();
  console.log("Found rb", id);
  if (id != rbId) {
    if (id) {
      loadRb(id);
    } else {
      hideRbAction();
    }
  }
}

function handleKeyPress(e) {
  if (e.which == 119) {
    viewDiff();
  } else if (e.which == 87) {
    approve();
  }
}

$(initialize);