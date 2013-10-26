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

    formatThread(data);
  }
  chrome.extension.sendRequest({type: "loadRb", rbId: id}, callback);
}

function formatThread(reviewData) {
  var $thread = $("div[role='main'] .nH.if");
  console.log("Formatting thread", $thread);
  $(".Bk", $thread).each(function() {
    formatCard($(this), reviewData);
  });
}

function formatCard($card, reviewData) {
  console.log("Formatting card", $card);
  var $msg = $($(".ii div", $card)[0]);
  var text = $msg.text();
  console.log("TEXT", text);
  if (text.indexOf("Gerrit-MessageType: newchange") >= 0) {
    formatNewChange($msg, text, reviewData);
  } else if (text.indexOf("Gerrit-MessageType: comment") >= 0) {
    formatComment($msg, text, reviewData);
  }
}

function formatNewChange($msg, text, reviewData) {
  var lines = text.split("\n");
  $msg.empty();
  var isDiff = false;
  var buffer = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var isAdd = line.indexOf("+") == 0;
    var isRemove = line.indexOf("-") == 0;
    var isFile = line.indexOf("diff --git") == 0;

    if (line.indexOf("Change-Id:") == 0) {
      isDiff = true;
    } else if (line.indexOf("Gerrit-Change-Id:") == 0) {
      isDiff = false;
    }
    if (isDiff) {
      buffer.push("<span style='font-family: monospace;'>");
      if (isAdd) {
        buffer.push("<span style='color: green;'>");
      } else if (isRemove) {
        buffer.push("<span style='color: red;'>");
      }
      if (isFile) {
        buffer.push("<br/><strong>");
      }
    }
    buffer.push($("<div/>").text(line).html());
    if (isDiff) {
      if (isFile) {
        buffer.push("</strong>");
      }
      if (isAdd || isRemove) {
        buffer.push("</span>");
      }
      buffer.push("</span>");
    }
    buffer.push("<br/>");
  }
  $msg.html(buffer.join(""));
}

function formatComment($msg, text, reviewData) {
  var lines = text.split("\n");
  $msg.empty();
  var buffer = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var isFileTitle = line.indexOf("File ") == 0;
    var isLine = line.indexOf("Line ") == 0;
    var isReview = line.indexOf("Code-Review") > 0;

    if (isReview) {
      var color = line.indexOf("+2") >= 0 ? "green" : line.indexOf("-1") >= 0 ? "red" : line.indexOf("-2") >= 0 ? "red" : "inherit";
      buffer.push("<strong style='color:" + color + ";font-size:1.5em'>");
    }
    if (isFileTitle) {
      buffer.push("<strong style='font-family: monospace;'>");
    }
    if (isLine) {
      buffer.push("<span style='font-family: monospace;'>");
    }

    buffer.push($("<div/>").text(line).html());

    if (isReview) {
      buffer.push("</strong>");
    }

    if (isFileTitle) {
      buffer.push("</strong>");
    }
    if (isLine) {
      buffer.push("</span>");
    }

    buffer.push("<br/>");
  };
  $msg.html(buffer.join(""));
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
var $rbBox = $("<div class='nH'><h3>Gerrit</h3></div>");

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