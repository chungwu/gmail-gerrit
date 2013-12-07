var gSettings = {};

var rbId = null;
var re_rgid = new RegExp(".*/(\\d+)$");

var infoBoxHeader = (
  "<h4><img title='Gerrit' src='${chrome.extension.getURL(\"icons/gerrit-big.png\")}'> <a href='${gerritUrl}/${diffId}' target='_blank'>${diffId}</a>: <span class='status'>${status}</span></h4>"
);

$.template("infoBoxHeader", infoBoxHeader);

var infoBox = (
  "<div>" +
    "<div class='note reviewers'>" +
      "<span class='note-title'>Reviewers: </span>" +
      "{%if !reviewers || reviewers.length == 0%}" +
        "None" +
      "{%else%}" +
        "{%each(i, reviewer) reviewers%}" +
          "${i > 0 ? ', ' : ''}<span class='${reviewer.status == \"approved\" ? \"reviewer-approved\" : \"\"}'>${reviewer.login}</span>" +
        "{%/each%}" +
      "{%/if%}" +
    "</div>" +
    "<div>" +
      "<span class='gerrit-button view-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO'>View</span>" +
      "<span class='gerrit-button comment-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO'>Comment</span>" +
    "</div>" +
    "<div>" +
      "<span class='gerrit-button action-button approve-button T-I J-J5-Ji lR T-I-ax7 T-I-Js-IF ar7 T-I-JO'>Approve</span>" +
      "<span class='gerrit-button action-button approve-comment-button T-I J-J5-Ji nX T-I-ax7 T-I-Js-Gs ar7 T-I-JO'>&amp; comment</span>" +
      "<span class='gerrit-button action-button approve-submit-button T-I J-J5-Ji nX T-I-ax7 T-I-Js-Gs ar7 T-I-JO'>&amp; submit</span>" +
    "</div>" +
    "<div>" +
      "<span class='gerrit-button action-button submit-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO'>Submit</span>" +
      "<span class='gerrit-button action-button rebase-submit-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO'>Rebase &amp; submit</span>" +
    "</div>" +
  "</div>"
);

$.template("infoBox", infoBox);

var $sideBox = $("<div class='nH gerrit-box gerrit-sidebox'/>");

var greenColor = "#045900";
var redColor = "#b30000";
var greenBg = "#D4FAD5";
var redBg = "#FFD9D9";

function extractReviewers(data) {
  var reviewers = [];
  var seen = {};
  if (data.labels && data.labels["Code-Review"] && data.labels["Code-Review"].all) {
    for (var i=0; i<data.labels["Code-Review"].all.length; i++) {
      var rev = data.labels["Code-Review"].all[i];
      if (!(rev.email in seen)) {
        reviewers.push({
          name: rev.name, email: rev.email, login: rev.email.split("@")[0], 
          self: rev.email == gSettings.email, status: rev.value == 2 ? "approved" : "new"
        });
        seen[rev.email] = true;
      }
    }
  }
  for (var i = 0; i < data.removable_reviewers.length; i++) {
    var rev = data.removable_reviewers[i];
    if (!(rev.email in seen)) {
      reviewers.push({
        name: rev.name, email: rev.email, login: rev.email.split("@")[0], 
        self: rev.email == gSettings.email, status: "new"
      });
      seen[rev.email] = true;
    }
  }
  return reviewers;
}


function performActionCallback(id, resp) {
  if (!resp.success) {
    renderError(id, resp.err_msg);
    alert ("ERROR: " + resp.err_msg);
  }
  loadDiff(id, function(resp) {
    if (!resp.success) {
      renderError(id, resp.err_msg);
      return;
    }
    renderBox(id, resp.data);
  });
}

function renderError(id, err_msg) {
  $sideBox.empty();
  var $header = $.tmpl("infoBoxHeader", {diffId: id, status: 'Error', gerritUrl: gSettings.url}).appendTo($sideBox);
  $(".status", $header).addClass("red");
  $("<div class='note gerrit-error'/>").text(err_msg).appendTo($sideBox);
  if (!gSettings.auth) {
    $("<a href='" + gSettings.url + "' class='gerrit-button action-button approve-button T-I J-J5-Ji lR T-I-ax7 T-I-Js-IF ar7 T-I-JO'>Login</span>").appendTo($sideBox);
  }
}

function renderBox(id, data) {
  $sideBox.empty();

  var status = reviewStatus(data);
  console.log("STATUS", status);
  var isOwner = gSettings.email == data.owner.email;
  var isReviewer = false;
  var reviewers = extractReviewers(data);
  for (var i = 0; i < reviewers.length; i++) {
    if (gSettings.email == reviewers[i].email) {
      isReviewer = true;
    }
  }

  var $header = $.tmpl("infoBoxHeader", {diffId: id, status: status, gerritUrl: gSettings.url});

  var $info = $.tmpl("infoBox", {
    diffId: id, reviewers: reviewers
  });

  var $status = $(".status", $header);
  $(".action-button", $info).hide();
  if (status == "Approved") {
    $status.addClass("green");
    if (isOwner) {
      $(".submit-button", $info).show();
    }
  } else if (status == "Merged") {
    $status.addClass("green");
  } else if (status == "Merge Pending") {
    /* Rebase not supported yet
    if (isOwner) {
      $(".rebase-submit-button").show();
    }
    */
  } else {
    if (isReviewer || isOwner) {
      $(".approve-button", $info).show();
    }
    if (isOwner) {
      $(".approve-submit-button", $info).show();
    } else if (isReviewer) {
      $(".approve-comment-button", $info).show();
    }
  }

  function actionButtonCallback(resp) {
    performActionCallback(id, resp);
  }

  $(".gerrit-button", $info).click(function() {
    var $this = $(this);
    if ($this.hasClass("view-button")) {
      viewDiff(id);
    } else if ($this.hasClass("comment-button")) {
      commentDiff(id, false, true, actionButtonCallback);
    } else if ($this.hasClass("approve-button")) {
      commentDiff(id, true, false, actionButtonCallback);
    } else if ($this.hasClass("approve-comment-button")) {
      commentDiff(id, true, true, actionButtonCallback);
    } else if ($this.hasClass("approve-submit-button")) {
      approveSubmitDiff(id, actionButtonCallback);
    } else if ($this.hasClass("submit-button")) {
      submitDiff(id, actionButtonCallback);
    } else if ($this.hasClass("rebase-submit-button")) {
      rebaseSubmitDiff(id, actionButtonCallback);
    }
  });  

  $sideBox.append($header);
  $sideBox.append($info);
}

function renderDiff(id) {
  var $sidebarBoxes = $("div[role='main'] .nH.adC > .nH:first-child");
  $sideBox.empty().prependTo($sidebarBoxes);

  function callback(resp) {
    console.log("Loaded rb", resp);
    if (!resp.success) {
      renderError(id, resp.err_msg);
      return;
    }
    rbId = id;
    var data = resp.data;

    renderBox(id, data);
    
    formatThread(data);
  }

  authenticatedSend({type: "loadDiff", rbId: id}, callback);
}

function authenticatedSend(msg, callback) {
  function authenticatingCallback(resp) {
    if (!resp.success && resp.status == 401) {
      showNeedLogin();
      gSettings.auth = false;
    }
    callback(resp);
  }
  if (!gSettings.auth) {
    console.log("Not authenticated yet, trying to authenticate...");
    authenticate(function(resp) {
      if (resp.success) {
        chrome.runtime.sendMessage(msg, authenticatingCallback);
      } else {
        console.log("Still failed to authenticate :'(");
        showNeedLogin();
        authenticatingCallback({success: false, err_msg: "Cannot authenticate"});
      }
    });
  } else {
    chrome.runtime.sendMessage(msg, authenticatingCallback);
  }
}

function loadDiff(id, callback) {
  authenticatedSend({type: "loadDiff", rbId: id}, callback);
}

function formatThread(reviewData) {
  var $thread = $("div[role='main'] .nH.if");
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

  if (gSettings.email != reviewData.owner.email) {
    // Not my commit, so show me the diff (but just once)
    $($(".show-diffs-button", $thread)[0]).click();
  }
}

function formatCard($card, reviewData) {
  var $msg = $($(".ii div", $card)[0]);
  var text = $msg.text();
  var html = $msg.html();

  if (!$.trim(text)) {
    return;
  }

  if (html.indexOf("gmail_quote") >= 0) {
    // Don't format; someone replied to the thread directly
  } else if (/^Gerrit-MessageType: newchange/gm.test(text)) {
    formatNewChange($msg, text, reviewData);
  } else if (/^Gerrit-MessageType: comment/gm.test(text)) {
    formatComment($msg, text, reviewData);
  } else if (/^Gerrit-MessageType: merged/gm.test(text)) {
    formatMerged($msg, text, reviewData);
  } else if (/^Gerrit-MessageType: merge-failed/gm.test(text)) {
    formatMergeFailed($msg, text, reviewData);
  } else if (/^Gerrit-MessageType: newpatchset/gm.test(text)) {
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

function _appendDiffs($container, lines, opt_hideHeader) {
  lines = lines.slice(indexOf(lines, function(l) { return l != ""; }));

  var diffStart = indexOf(lines, function(l) { return l.indexOf("Change-Id:") == 0; });

  if (!opt_hideHeader) {
    var $header = highlightBox().appendTo($container);
    var headerLines = _trimLines(lines.slice(0, diffStart));
    for (var i=0; i<headerLines.length; i++) {
      var $line = $("<span/>").text(headerLines[i]).append("<br/>").appendTo($header);
      if (i == 0) {
        $line.css({fontWeight: "bold", fontSize: "1.3em"});
      }
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
  var inFileDiff = false;
  for (var i=diffStart; i < lines.length; i++) {
    var line = lines[i];
    if (line == "--") {
      break;
    }
    var $line = $("<div/>").text(line).css({fontFamily: "monospace", padding: "3px 0"});
    if (inFileDiff && line == "") {
      continue;
    } else if (line == "") {
      $line.append("<br/>");
    } else if (inFileDiff && line[0] == "+") { // is add
      //$line.css({color: greenColor, backgroundColor: greenBg});
      $line.css({backgroundColor: greenBg});
    } else if (inFileDiff && line[0] == "-") { // is remove
      //$line.css({color: redColor, backgroundColor: redBg});
      $line.css({backgroundColor: redBg});
    } else if (line.indexOf("diff --git") == 0) { // is new file
      $cur = highlightBox("#fdfdfd", "#eee").appendTo($box);
      $line.append("<br/><br/>");
      $line.css({fontWeight: "bold", fontSize: "1.3em"});
      inFileDiff = true;
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
  var inFileComment = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (line == "--") {
      break;
    }

    if (_RE_COMMENT_COUNT.test(line)) {
      // also skip the next line
      i += 1;
      continue;
    }

    var $line = $("<div/>").text(line).css("padding", "3px 0");
    if (inFileComment && line == "") {
      continue;
    } else if (line == "") {
      $line.append("<br/>");
    } else if (line.indexOf("Patch Set") == 0) { // is patch set label
      var color = line.indexOf("+2") >= 0 ? greenColor : line.indexOf("-1") >= 0 ? redColor : line.indexOf("-2") >= 0 ? redColor : "inherit";
      $line.css("color", color);
      $line.css("fontSize", "1.3em");
      $line.css("fontWeight", "bold");
      $box = highlightBox().appendTo($msg);
    } else if (line.indexOf("File ") == 0) { // is file title
      $line.css({fontFamily: "monospace", fontSize: "1.3em", fontWeight: "bold"});
      $box = highlightBox().appendTo($msg);
      inFileComment = true;
    } else if (line.indexOf("Line ") == 0) { // is line diff
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
  var lines = text.split('\n');
  var $ul = $("<ul/>").appendTo($msg);
  for (var i=0; i<lines.length; i++) {
    var line = lines[i];
    if (line.indexOf("*") == 0) {
      $("<li/>").text($.trim(line.substring(1))).appendTo($ul);
    }
  }
}

var RE_PATCHSET = /Gerrit-PatchSet: (\d+)/;
function formatNewPatch($msg, text, reviewData) {
  var pid = RE_PATCHSET.exec(text)[1];
  $msg.empty().html("<h3>New Patch Set: " + pid + "</h3>");
  
  var lines = text.split("\n");
  var diffStart = indexOf(lines, function(l) { return l.indexOf(".....") == 0; })+1;
  _appendDiffs($msg, lines.slice(diffStart), true);
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

function clearDiff() {
  rbId = null;
  $sideBox.detach();
  hidePageAction();
}

function hidePageAction() {
  chrome.runtime.sendMessage({type: "hidePageAction"});
}

function showNeedSetup() {
  chrome.runtime.sendMessage({type: "showSetup"});
}

function showNeedLogin() {
  chrome.runtime.sendMessage({type: "showLogin"});
}

function loadSettings(callback) {
  chrome.runtime.sendMessage({type: "settings"}, callback);
}

function authenticate(callback) {
  chrome.runtime.sendMessage({type: "authenticate"}, function(resp) {
    if (resp.success) {
      gSettings.auth = true;
      gSettings.email = resp.email;
      gSettings.user = resp.user;
    } else {
      gSettings.auth = false;
      gSettings.email = undefined;
      gSettings.user = undefined;
    }
    callback(resp);
  });
}

function viewDiff(id) {
  chrome.runtime.sendMessage({type: "viewDiff", rbId: id});  
}

function commentDiff(id, approve, comment, callback) {
  var commentText = null;
  if (comment) {
    commentText = prompt("Say your piece.");
    if (!commentText) {
      return;
    }
  }
  chrome.runtime.sendMessage({type: "commentDiff", rbId: id, approve: approve, comment: commentText}, callback);
}

function approveSubmitDiff(id, callback) {
  chrome.runtime.sendMessage({type: "approveSubmitDiff", rbId: id}, callback);
}

function submitDiff(id, callback) {
  chrome.runtime.sendMessage({type: "submitDiff", rbId: id}, callback);
}

function rebaseSubmitDiff(id, callback) {
  chrome.runtime.sendMessage({type: "rebaseSubmitDiff", rbId: id}, callback);
}

function initialize() {
  loadSettings(function(settings) {
    gSettings.url = settings.url;

    if (!gSettings.url) {
      // No URL set; forget it
      return;
    }

    if (settings.gmail && window.document.title.indexOf(settings.gmail) < 0) {
      // Email is set and is not the current gmail account; forget it
      console.log("Expecting gmail " + settings.gmail + " but not found; nevermind!");
      return;
    }

    console.log("Running Gerrit plugin!");

    $(window).hashchange(function() {
      setTimeout(checkDiff, 100);
    });
    setTimeout(function() {
      $("body").keypress(handleKeyPress);
      checkDiff();
    }, 3000);

    authenticate(function(resp) {
      if (resp.success) {
        console.log("Authenticated!");
      } else {
        console.log("Not authenticated!");
        showNeedLogin();
      }
    });
  });
}

function extractDiffIdFromUrl(url) {
  var m = re_rgid.exec(url);
  if (m && m.length >= 2) {
    return m[1];
  }
  return null;
}

function extractDiffId() {
  var $thread = $("div[role='main']");
  var $anchor = $("a[href*='" + gSettings.url + "']", $thread);
  if ($anchor.length > 0) {
    var url = $anchor.attr("href");
    return extractDiffIdFromUrl(url);
  } else {
    return null;
  }
}

function checkDiff() {
  var id = extractDiffId();
  console.log("Found rb", id);
  if (id != rbId) {
    clearDiff();
    if (id) {
      renderDiff(id);
    }
  }
}

function handleKeyPress(e) {
  var $target = $(e.target);
  if ($target.hasClass("editable") || $target.prop("tagName").toLowerCase() == "input") {
    return;
  }
  if (rbId) {
    if (e.which == 119) {
      viewDiff(rbId);
    } else if (e.which == 87) {
      commentDiff(rbId, true, false, function(resp) { performActionCallback(rbId, resp); });
    }
  }
}

$(function() {
  setTimeout(initialize, 3000);
});