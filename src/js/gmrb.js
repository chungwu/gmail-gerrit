var rbId = null;
var rbUrl = null;
var rbEmail = null;
var re_rgid = new RegExp(".*/(\\d+)$");
var $rbBox = $(
  "<div class='nH' style='padding-bottom: 20px'>" +
    "<div class='am6'></div>" + 
    "<h4 style='margin-bottom: 10px'>Gerrit: <span class='status'></span></h4>" + 
    "<div>" +
      "<span class='view-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO' style='margin-bottom: 10px'>View</span>" +
      "<span class='comment-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO' style='margin-bottom: 10px'>Comment</span>" +
    "</div>" +
    "<div>" +
      "<span class='action-button approve-button action-button approve-button T-I J-J5-Ji lR T-I-ax7 T-I-Js-IF ar7 T-I-JO' style='margin-bottom: 10px'>Approve</span>" +
      "<span class='action-button approve-comment-button T-I J-J5-Ji nX T-I-ax7 T-I-Js-Gs ar7 T-I-JO' style='margin-bottom: 10px'>&amp; say...</span>" +
    "</div>" +
    "<div>" +
      "<span class='action-button merge-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO' style='margin-bottom: 10px'>Merge</span>" +
    "</div>" +
  "</div>"
);

$(".view-button", $rbBox).click(function() { viewCurrentReview(); });
$(".approve-button", $rbBox).click(function() { commentCurrentReview(true, false); });
$(".approve-comment-button", $rbBox).click(function() { commentCurrentReview(true, true); });
$(".comment-button", $rbBox).click(function() { commentCurrentReview(false, true); });
$(".merge-button", $rbBox).click(function() { mergeCurrentReview(); });

var greenColor = "#045900";
var redColor = "#b30000";

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
      $status.css("color", greenColor);
      if (isOwner) {
        $(".merge-button", $rbBox).show();
      }
    } else if (status == "Abandoned") {
      $status.css("color", redColor);
    } else if (status == "Merged") {
      $status.css("color", greenColor);
    } else {
      if (isReviewer) {
        $(".approve-button", $rbBox).show();
        $(".approve-comment-button", $rbBox).show();
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
  $($(".show-diffs-button", $thread)[0]).click();
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
  var diffStart = indexOf(lines, function(l) { return l.indexOf(".....") == 0; })+1;
  _appendDiffs($msg, lines.slice(diffStart));
}

function indexOf(array, func, opt_backward) {
  if (opt_backward) {
    for (var i=array.length-1; i>=0; i--) {
      if (func(array[i])) {
        return i;
      }
    }
    return -1;
  } else {
    for (var i=0; i<array.length; i++) {
      if (func(array[i])) {
        return i;
      }
    }
    return -1;
  }
}

_FUNC_NOT_EMPTY = function(l) { return l != ""; };

function _trimLines(lines) {
  return lines.slice(indexOf(lines, _FUNC_NOT_EMPTY), indexOf(lines, _FUNC_NOT_EMPTY, true) + 1);
}

function _appendDiffs($container, lines) {
  lines = lines.slice(indexOf(lines, function(l) { return l != ""; }));

  var diffStart = indexOf(lines, function(l) { return l.indexOf("Change-Id:") == 0; });

  var $header = highlightBox().appendTo($container);
  var headerLines = _trimLines(lines.slice(0, diffStart));
  for (var i=0; i<headerLines.length; i++) {
    var $line = $("<span/>").text(headerLines[i]).append("<br/>").appendTo($header);
    if (i == 0) {
      $line.css({fontWeight: "bold", fontSize: "1.3em"});
    }
  }

  var $toggle = $("<div class='T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO show-diffs-button'/>")
    .text("Show diffs")
    .css({fontWeight: "bold", margin: "10px 0"})
    .click(function() {
      if ($toggle.hasClass("showing")) {
        $toggle.text("Show diffs");
        $box.hide();
        $toggle.removeClass("showing");
      } else {
        $toggle.text("Hide diffs");
        $box.show();
        $toggle.addClass("showing");
      }
    }).appendTo($container);

  var $box = $("<div/>").appendTo($container).hide();

  var $cur = $box;
  for (var i=diffStart; i < lines.length; i++) {
    var line = lines[i];
    if (line == "--") {
      break;
    }
    var $line = $("<span/>").text(line).css("fontFamily", "monospace").append("<br/>");
    if (line.indexOf("+") == 0) { // is add
      $line.css("color", greenColor);
    } else if (line.indexOf("-") == 0) { // is remove
      $line.css("color", redColor);
    } else if (line.indexOf("diff --git") == 0) { // is new file
      $cur = highlightBox("#fcfcfc", "#ddd").appendTo($box);
      $line.append("<br/>");
      $line.css({fontWeight: "bold", fontSize: "1.3em"});
    } else if (line.indexOf("@@") == 0) {
      $line.css("fontWeight", "bold");
    }
    $cur.append($line);
  }
}

function highlightBox(color, border) {
  color = color || "#ffffdd";
  border = border || "#ccc";
  return $("<div/>").css({backgroundColor: color, padding: "10px", margin: "10px 0", border: "1px solid " + border});
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
      var color = line.indexOf("+2") >= 0 ? greenColor : line.indexOf("-1") >= 0 ? redColor : line.indexOf("-2") >= 0 ? redColor : "inherit";
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
  
  var lines = text.split("\n");
  var diffStart = indexOf(lines, function(l) { return l.indexOf(".....") == 0; })+1;
  _appendDiffs($msg, lines.slice(diffStart));
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
  } else if (reviewData.status == 'SUBMITTED') {
    return 'Merge Pending';
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

function commentCurrentReview(approve, comment) {
  if (!rbId) { return; }
  var commentText = null;
  if (comment) {
    commentText = prompt("Say your piece.");
    if (!commentText) {
      return;
    }
  }
  chrome.extension.sendRequest({type: "commentDiff", rbId: rbId, approve: approve, comment: commentText}, function(success, textStatus) {
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
    viewCurrentReview();
  }
}

$(initialize);