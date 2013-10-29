var rbId = null;
var rbUrl = null;
var rbEmail = null;
var re_rgid = new RegExp(".*/(\\d+)$");
var $rbBox = $(
  "<div class='nH' style='padding-bottom: 20px'>" +
    "<div class='am6'></div>" + 
    "<h4 style='margin-bottom: 10px'>Gerrit: <span class='status'></span></h4>" + 
    "<span class='view-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO' target='_blank_'>View</span>" +
    "<span class='action-button approve-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO' target='_blank_'>Approve</span>" +
    "<span class='action-button merge-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO' target='_blank_'>Merge</span>" +
  "</div>"
);

$(".view-button", $rbBox).click(function() { viewCurrentReview(); });
$(".approve-button", $rbBox).click(function() { approveCurrentReview(); });
$(".merge-button", $rbBox).click(function() { mergeCurrentReview(); });

function loadRb(id) {
  function callback(data) {
    if (!data) {
      showNeedLogin();
      return;
    }
    rbId = id;
    console.log("RB", data);

    var status = reviewStatus(data);
    console.log("STATUS", status);
    chrome.extension.sendRequest({type: "showRbAction", rbId: id, status: status});

    $sidebarBoxes = $("div[role='main'] .nH.anT .nH");
    $rbBox.insertAfter($($sidebarBoxes[0]));
    
    $(".action-button", $rbBox).hide();

    var $status = $(".status", $rbBox).text(status).css("color", "#555");
    var isOwner = rbEmail == data.owner.email;
    var isReviewer = false;
    for (var i = 0; i < data.removable_reviewers.length; i++) {
      if (rbEmail== data.removable_reviewers[i].email) {
        isReviewer = true;
        break;
      }
    }
    if (status == "Approved") {
      $status.css("color", "green");
      if (isOwner) {
        $(".merge-button", $rbBox).show();
      }
    } else if (status == "Abandoned") {
      $status.css("color", "red");
    } else if (status == "Merged") {
      $status.css("color", "green");
    } else {
      if (isReviewer) {
        $(".approve-button", $rbBox).show();
      }
    }

    formatThread(data);
  }
  chrome.extension.sendRequest({type: "loadRb", rbId: id}, callback);
}

function formatThread(reviewData) {
  var $thread = $("div[role='main'] .nH.if");
  console.log("Formatting thread", $thread);
  var curId = rbId;
  function doFormat() {
    if (!rbId || curId != rbId) {
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
  } else if (text.indexOf("Gerrit-MessageType: merged") >= 0) {
    formatMerged($msg, text, reviewData);
  } else if (text.indexOf("Gerrit-MessageType: merge-failed") >= 0) {
    formatMergeFailed($msg, text, reviewData);
  } else if (text.indexOf("Gerrit-MessageType: newpatchset") >= 0) {
    formatNewPatch($msg, text, reviewData);
  }
  $card.addClass("gerrit-formatted");
}

function formatNewChange($msg, text, reviewData) {
  var lines = text.split("\n");
  $msg.empty();
  var isDiff = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (line == "--") {
      break;
    }

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

function highlightBox() {
  return $("<div/>").css({backgroundColor: "#ffffcc", padding: "10px", margin: "10px 0", border: "1px solid #ccc"});
}

_RE_COMMENT_COUNT = /^\(\d+ comments?\)/
function formatComment($msg, text, reviewData) {
  var lines = text.split("\n");
  $msg.empty();
  var $box = $msg;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (line == "--") {
      break;
    }

    if (_RE_COMMENT_COUNT.test(line)) {
      continue;
    }

    var $line = $("<div/>").text(line);

    if (line.indexOf("Patch Set") == 0) { // is patch set label
      var color = line.indexOf("+2") >= 0 ? "green" : line.indexOf("-1") >= 0 ? "red" : line.indexOf("-2") >= 0 ? "red" : "inherit";
      $line.css("color", color);
      $line.css("fontSize", "1.3em");
      $line.css("fontWeight", "bold");
      $box = highlightBox().appendTo($msg);
    }

    if (line.indexOf("File ") == 0) { // is file title
      $line.css({fontFamily: "monospace", fontSize: "1.3em", fontWeight: "bold"});
      $line.append("<br/>");
      $box = highlightBox().appendTo($msg);
    }

    if (line.indexOf("Line ") == 0) { // is line diff
      $line.css("fontFamily", "monospace");
      $line.prepend("<br/>");
    }

    if (line.indexOf("............") == 0) {
      $box = $msg;
    }

    $box.append($line);
  };
}

function formatMerged($msg, text, reviewData) {
  $msg.empty().html("<h3>Merged</h3>");
}

function formatMergeFailed($msg, text, reviewData) {
  $msg.empty().html("<h3>Merge Failed</h3>");
}

var RE_PATCHSET = /Gerrit-PatchSet: (\d+)/;
function formatNewPatch($msg, text, reviewData) {
  var pid = RE_PATCHSET.exec(text)[1];
  $msg.empty().html("<h3>New Patch Set: " + pid + "</h3>");
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

function reviewStatus(reviewData) {
  if (reviewData.status == 'MERGED') {
    return 'Merged';
  } else if (reviewData.status == 'ABANDONED') {
    return 'Abandoned';
  } else if (isApproved(reviewData)) {
    return 'Approved';
  } else if (reviewData.reviewed) {
    return 'In Review';
  } else {
    return 'New';
  }
}

function hideRbAction() {
  rbId = null;
  $rbBox.detach();
  chrome.extension.sendRequest({type: "hideRbAction"});
}

function showNeedSetup() {
  chrome.extension.sendRequest({type: "showSetup"});
}

function showNeedLogin() {
  chrome.extension.sendRequest({type: "showLogin"});
}

function loadSettings(callback) {
  chrome.extension.sendRequest({type: "settings"}, callback);
}

function viewCurrentReview() {
  if (!rbId) { return; }
  chrome.extension.sendRequest({type: "viewDiff", rbId: rbId});  
}

function approveCurrentReview() {
  if (!rbId) { return; }
  chrome.extension.sendRequest({type: "approveDiff", rbId: rbId}, function(success, textStatus) {
    if (success) { 
      reloadReview(); 
    } else {
      alert("ERROR: " + textStatus);
    }
  });
}

function mergeCurrentReview() {
  if (!rbId) { return; }
  chrome.extension.sendRequest({type: "mergeDiff", rbId: rbId}, function(success, textStatus) {
    if (success) { 
      reloadReview(); 
    } else {
      alert("ERROR: " + textStatus);
    }
  });
}

function reloadReview() {
  if (!rbId) { return; }
  loadRb(rbId);
}

function initialize() {
  loadSettings(function(settings) { 
    console.log("SETTINGS", settings);
    if (!settings) {
      alert("Unable to load Gerrit settings or connect to Gerrit. Check what's wrong and refresh.");
      return;
    }
    rbUrl = settings.url; 
    rbEmail = settings.email;
    if (!rbUrl) {
      showNeedSetup();
      return;
    }
    if (!settings.auth) {
      showNeedLogin();
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
  var m = re_rgid.exec(url);
  if (m && m.length >= 2) {
    return m[1];
  }
  return null;
}

function extractRbId() {
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
  }
}

$(initialize);