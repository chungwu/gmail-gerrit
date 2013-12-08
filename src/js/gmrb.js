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
  loadChange(id, function(resp) {
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

function renderChange(id) {
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

  authenticatedSend({type: "loadChange", rbId: id}, callback);
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

function loadChange(id, callback) {
  authenticatedSend({type: "loadChange", rbId: id}, callback);
}

function loadFiles(id, revisionId, callback) {
  authenticatedSend({type: "loadFiles", rbId: id, revisionId: revisionId}, callback);
}

function loadDiff(id, revisionId, file, baseId, callback) {
  authenticatedSend({type: "loadDiff", rbId: id, revisionId: revisionId, file: file, baseId: baseId}, callback);
}

function loadComments(id, revisionId, callback) {
  authenticatedSend({type: "loadComments", rbId: id, revisionId: revisionId}, callback);
}

function loadFileContent(id, revisionId, file, callback) {
  authenticatedSend({type: "loadFileContent", rbId: id, revisionId: revisionId, file: file}, callback);
}

function renderError(text) {
  return $("<div class='gerrit-error'/>").text(text);
}

function formatThread(reviewData) {
  var $thread = $("div[role='main'] .nH.if");
  var curId = rbId;

  $(".Bk", $thread).each(function() {
    if ($(this).html().indexOf("gmail_quote") >= 0) {
      // someone sent this email directly; don't format.
      // TODO: we need a much better way of detecting this!
      $(this).addClass("gerrit-formatted");
      return;
    }

    $(this).data("gerritMessage", true);
  });

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

  if (!$.trim(text)) {
    return;
  }

  if (/^Gerrit-MessageType: newchange/gm.test(text)) {
    formatNewChange($card, $msg, text, reviewData);
  } else if (/^Gerrit-MessageType: comment/gm.test(text)) {
    formatComment($card, $msg, text, reviewData);
  } else if (/^Gerrit-MessageType: merged/gm.test(text)) {
    formatMerged($card, $msg, text, reviewData);
  } else if (/^Gerrit-MessageType: merge-failed/gm.test(text)) {
    formatMergeFailed($card, $msg, text, reviewData);
  } else if (/^Gerrit-MessageType: newpatchset/gm.test(text)) {
    formatNewPatch($card, $msg, text, reviewData);
  }
  $card.addClass("gerrit-formatted");
}

function getRevisionIdByPatchNumber(reviewData, patchNumber) {
  for (var k in reviewData['revisions']) {
    if (reviewData['revisions'][k]._number == patchNumber) {
      return k;
    }
  }
  return undefined;
}

function formatNewChange($card, $msg, text, reviewData) {
  $msg.empty();

  var pid = extractPatchSet(text);
  var revId = getRevisionIdByPatchNumber(reviewData, pid);

  var $header = $("<div class='gerrit-highlight-box'/>").appendTo($msg);
  var revision = reviewData.revisions[revId];
  var message = extractCommitMessage(revision.commit);
  $header.append($("<div class='gerrit-header'/>").text(revision.commit.subject));
  if (message) {
    $header.append($("<p/>").text(message));
  }

  $msg.append(renderRevisionDiff(reviewData, revId, null));
}

function extractCommitMessage(commit) {
  var subject = commit.subject;
  var message = commit.message;
  if (!message) {
    return undefined;
  }
  var subjectIndex = message.indexOf(subject);
  if (subjectIndex >= 0) {
    message = message.substring(subjectIndex + subject.length, message.length);
  }
  var changeIndex = message.indexOf("Change-Id: ");
  if (changeIndex >= 0) {
    message = message.substring(0, changeIndex);
  }
  return $.trim(message);
}

function renderRevisionDiff(reviewData, revId, baseId) {
  var $container = $("<div/>");
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

  var files = reviewData.revisions[revId].files;
  for (var file in files) {
    if (file == "/COMMIT_MSG") {
      continue;
    }
    renderFileBox(reviewData, revId, file, baseId).appendTo($box);
  }

  return $container;
}

function renderFileBox(reviewData, revId, file, baseId) {
  var $filebox = $("<div class='gerrit-file-box'/>");
  $filebox.append($("<div class='gerrit-file-title'/>").text(file));

  loadDiff(reviewData._number, revId, file, undefined, function(resp) {
    if (resp.success) {
      console.log("Loaded file diffs for " + file, resp.data);
      $filebox.append(appendFileDiff($filebox, resp.data));
    } else {
      $filebox.append($("<div class='gerrit-error'/>").text("Error loading diff :'("));
    }
  });  
  return $filebox;
}

function appendFileDiff($box, data) {
  var contextLines = 3;
  var aLine = 1, bLine = 1;
  var curSection = 0;
  
  function renderHeader(text) {
    return $("<div class='gerrit-line-header'/>").text(text);
  }

  function renderLineHeader(a, b) {
    return renderHeader("@@ -" + a + ", +" + b + " @@");
  }

  function renderLine(text, type) {
    var prefix = type == "new" ? "+" : type == "old" ? "-" : " ";
    var $line = $("<pre class='gerrit-line'/>").text(prefix + text).appendTo($box);
    if (type == "new") {
      $line.addClass("gerrit-new-line");
    } else if (type == "old") {
      $line.addClass("gerrit-old-line");
    }
    return $line;
  }

  if (data.change_type == "ADDED") {
    $box.append(renderHeader("(NEW FILE)"));
  } else if (data.change_type == "DELETED") {
    $box.append(renderHeader("(DELETED FILE)"));
  } else if (data.change_type == "RENAMED") {
    $box.append(renderHeader("(FILE RENAMED)"));
  }

  $box.append(renderLine(data.diff_header[data.diff_header.length-2]).addClass("gerrit-old-line"));
  $box.append(renderLine(data.diff_header[data.diff_header.length-1]).addClass("gerrit-new-line"));

  var forwardLines = -1;
  while (curSection < data.content.length) {
    var section = data.content[curSection];
    if ("ab" in section) {
      aLine += section.ab.length;
      bLine += section.ab.length;
      if (forwardLines >= 0) {
        var toAppend = Math.min(section.ab.length, contextLines - forwardLines);
        for (var i = 0; i < toAppend; i++) {
          $box.append(renderLine(section.ab[i]));
          forwardLines += 1;
        }
        if (forwardLines >= contextLines) {
          forwardLines = -1;
        }
      }
    } else if ("skip" in section) {
      aLine += section.skip;
      bLine += section.skip;
      forwardLines = -1;
    } else {
      if (forwardLines < 0) {
        // Starting a new section
        if (curSection > 0 && "ab" in data.content[curSection - 1]) {
          // Walk backwards for some context lines
          var backSection = data.content[curSection - 1];
          var backLines = Math.min(backSection.ab.length, contextLines);
          $box.append(renderLineHeader(aLine-backLines, bLine-backLines));
  
          for (var i = backSection.ab.length - backLines; i < backSection.ab.length; i++) {
            $box.append(renderLine(backSection.ab[i]));
          }
        } else {
          $box.append(renderLineHeader(aLine, bLine));
        }
      }

      if ("a" in section) {
        for (var i = 0; i < section.a.length; i++) {
          $box.append(renderLine(section.a[i], "old"));
        }
        aLine += section.a.length;
      }
      if ("b" in section) {
        for (var i = 0; i < section.b.length; i++) {
          $box.append(renderLine(section.b[i], "new"));
        }
        bLine += section.b.length;
      }

      // Collect some forward lines
      forwardLines = 0;
    }
    curSection += 1
  }
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

function highlightBox(color, border) {
  color = color || "#ffffdd";
  border = border || "#ccc";
  return $("<div/>").css({backgroundColor: color, padding: "10px", margin: "10px 0", border: "1px solid " + border});
}

_RE_COMMENT_COUNT = /^\(\d+ comments?\)/
function formatComment($card, $msg, text, reviewData) {
  var pid = extractPatchSet(text);
  var revId = getRevisionIdByPatchNumber(reviewData, pid);
  $msg.empty();

  /* Commenting this out for now, but may need to come back to it :-/
  var lines = text.split("\n");
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

  $msg.append($("<h6/>").text("NEW STUFF!"));
  */

  var gMsg = guessGerritMessage($card, text, reviewData);
  console.log("Message", gMsg);
  if (gMsg._revision_number != pid) {
    $msg.append(renderError("UH-OH!!! Revision numbers don't match!!  Go bug Chung!!"));
    return;
  }

  var messageLines = gMsg.message.split("\n");
  var $header = $("<div/>").appendTo($msg);
  for (var i = 0; i < messageLines.length; i++) {
    var ptext = messageLines[i];
    var $line = $(i == 0 ? "<div/>" : "<p/>").text(ptext);
    if (i == 0) {
      $line.addClass("gerrit-header");
    }
    if (ptext.indexOf("Code-Review+2") >= 0) {
      $header.addClass("gerrit-highlight-box");
      $line.addClass("green");
    } else {
      $header.addClass("gerrit-content-box");
    }
    $header.append($line);
  }

  function doFormatFileComments(file, content, comments) {
    var lines = content.split("\n");
    var $filebox = $("<div class='gerrit-content-box'/>").appendTo($msg);
    $filebox.append($("<div class='gerrit-file-title'/>").text(file));
    for (var i = 0; i < comments.length; i++) {
      $("<br/>").appendTo($filebox);
      var comment = comments[i];
      $("<pre class='gerrit-line'/>").text("Line " + comment.line + ": " + lines[comment.line-1]).appendTo($filebox);
      $("<div/>").text(comment.message).appendTo($filebox);
    }
    console.log("FILE " + file, comments);
  }

  function formatFileComments(file, comments) {
    if (reviewData.revisions[revId].files[file].content) {
      doFormatFileComments(file, reviewData.revisions[revId].files[file].content, comments);
    } else {
      loadFileContent(reviewData._number, revId, file, function(resp) {
        if (!resp.success) {
          $msg.append(renderError("Cannot load file :'("));
        } else {
          reviewData.revisions[revId].files[file].content = resp.data;
          doFormatFileComments(file, resp.data, comments);
        }
      });
    }
  }

  function doFormatComments(comments) {
    for (var file in comments) {
      var fileComments = comments[file].filter(function(c) {return c.author.email == gMsg.author.email && c.updated == gMsg.date});
      if (fileComments.length == 0) {
        continue;
      }
      formatFileComments(file, fileComments);
    }
  }

  if (reviewData.revisions[revId].comments) {
    doFormatComments(reviewData.revisions[revId].comments);
  } else {
    loadComments(reviewData._number, revId, function(resp) {
      if (!resp.success) {
        $msg.append(renderError("Cannot load comments :'("));
      } else {
        console.log("Loaded comments", resp.data);
        reviewData.revisions[revId].comments = resp.data;
        doFormatComments(resp.data);
      }
    });
  }
}

function guessGerritMessage($card, text, reviewData) {
  // TODO: this tries to match a Gmail $card with a reviewData.messages.
  // Very fragile!  Surely there's a better way???
  var cardFrom = $("span.gD", $card).text();
  console.log("Card from:", cardFrom);
  for (var i = 0; i < reviewData.messages.length; i++) {
    var msg = reviewData.messages[i];
    if (!msg.author) {
      // Gerrit-generated messages (like merge failed) do not have an author
      continue;
    }
    if ((cardFrom.indexOf(msg.author.name) >= 0 || 
         cardFrom.indexOf(msg.author.email) >= 0 ||
         cardFrom.indexOf(msg.author.username) >= 0) && 
        text.indexOf(msg.message) >= 0) {
      return reviewData.messages[i];
    }
  }
  return undefined;
}

function formatMerged($card, $msg, text, reviewData) {
  $msg.empty().html("<h3>Merged</h3>");
}

function formatMergeFailed($card, $msg, text, reviewData) {
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
function extractPatchSet(text) {
  return RE_PATCHSET.exec(text)[1];
}

function formatNewPatch($card, $msg, text, reviewData) {
  var pid = extractPatchSet(text);
  $msg.empty().html("<h3>New Patch Set: " + pid + "</h3>");
  
  var revId = getRevisionIdByPatchNumber(reviewData, pid);
  $msg.append(renderRevisionDiff(reviewData, revId, null));  
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
        checkDiff();
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
      renderChange(id);
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