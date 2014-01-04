var gSettings = {};

var changeId = null;
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
    "</div>" +
    "<div>" +
      "<span class='gerrit-button action-button rebase-button T-I J-J5-Ji lR T-I-ax7 T-I-Js-IF ar7 T-I-JO'>Rebase</span>" +
      "<span class='gerrit-button action-button rebase-submit-button T-I J-J5-Ji nX T-I-ax7 T-I-Js-Gs ar7 T-I-JO'>&amp; submit</span>" +
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

function loadAndRenderBox(id) {
  loadChange(id, function(resp) {
    if (!resp.success) {
      renderErrorBox(id, resp.err_msg);
    } else {
      renderBox(id, resp.data);
    }
  });
}

function performActionCallback(id, resp) {
  if (!resp.success) {
    renderErrorBox(id, resp.err_msg);
  } else {
    loadAndRenderBox(id);
  }
}

function renderErrorBox(id, err_msg) {
  $sideBox.empty();
  var $header = $.tmpl("infoBoxHeader", {diffId: id, status: 'Error', gerritUrl: gSettings.url}).appendTo($sideBox);
  $(".status", $header).addClass("red");
  $("<div class='note gerrit-error'/>").text(err_msg).appendTo($sideBox);
  if (!gSettings.auth) {
    makeButton("Login", false, gSettings.url).appendTo($sideBox);
    var $reloadButton = makeButton("Try again").appendTo($sideBox).click(function() {
      renderChange(id);
    });
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

  var $header = $.tmpl("infoBoxHeader", {diffId: id, status: status, gerritUrl: gSettings.url}).appendTo($sideBox);

  var $info = $.tmpl("infoBox", {
    diffId: id, reviewers: reviewers
  }).appendTo($sideBox);

  var $status = $(".status", $header);
  $(".action-button", $info).hide();
  if (status == "Approved") {
    $status.addClass("green");
    if (isOwner) {
      $(".submit-button", $info).show();
      if (!data.mergeable) {
        $(".rebase-button", $info).show();
        $(".rebase-submit-button", $info).show();
      }
    }
  } else if (status == "Merge Pending") {
    if (isOwner) {
      $(".rebase-button", $info).show();
      $(".rebase-submit-button", $info).show();
    }
  } else if (status == "Merged") {
    $status.addClass("green");
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
      rebaseSubmitChange(id, actionButtonCallback);
    } else if ($this.hasClass("rebase-button")) {
      rebaseChange(id, actionButtonCallback);
    }
  });  
}

function renderChange(id) {
  var $sidebarBoxes = $("div[role='main'] .nH.adC > .nH:first-child");
  $sideBox.empty().prependTo($sidebarBoxes);

  function callback(resp) {
    console.log("Loaded change", resp);
    if (!resp.success) {
      renderErrorBox(id, resp.err_msg);
      return;
    }
    changeId = id;
    var data = resp.data;

    renderBox(id, data);
    
    formatThread(data);
  }

  authenticatedSend({type: "loadChange", id: id}, callback);
}

function authenticatedSend(msg, callback) {
  function authenticatingCallback(resp) {
    if (!resp.success && resp.status == 401) {
      showNeedLogin();
      gSettings.auth = false;
    }
    console.log("Function call:", msg);
    console.log("Result:", resp);
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
  authenticatedSend({type: "loadChange", id: id}, callback);
}

function loadFiles(id, revId, callback) {
  authenticatedSend({type: "loadFiles", id: id, revId: revId}, callback);
}

function loadDiff(id, revId, file, baseId, callback) {
  authenticatedSend({type: "loadDiff", id: id, revId: revId, file: file, baseId: baseId}, callback);
}

function loadAndCacheComments(reviewData, revId, callback) {
  if (reviewData.revisions[revId].comments) {
    callback({success: true, data: reviewData.revisions[revId].comments});
  } else {
    loadComments(reviewData._number, revId, function(resp) {
      if (!resp.success) {
        callback(resp);
      } else {
        reviewData.revisions[revId].comments = resp.data;
        callback(resp);
      }
    });
  }
}

function loadComments(id, revId, callback) {
  authenticatedSend({type: "loadComments", id: id, revId: revId}, callback);
}

function loadAndCacheFileContent(reviewData, revId, file, callback) {
  if (reviewData.revisions[revId].files[file].content) {
    callback({success: true, data: reviewData.revisions[revId].files[file].content});
  } else {
    loadFileContent(reviewData._number, revId, file, function(resp) {
      if (!resp.success) {
        callback(resp);
      } else {
        reviewData.revisions[revId].files[file].content = resp.data;
        callback(resp);
      }
    });
  }
}

function loadFileContent(id, revId, file, callback) {
  authenticatedSend({type: "loadFileContent", id: id, revId: revId, file: file}, callback);
}

function renderError(text) {
  return $("<div class='gerrit-error'/>").text(text);
}

function formatThread(reviewData) {
  var $thread = $("div[role='main'] .nH.if");
  var curId = changeId;

  var numMessages = $(".Bk", $thread).length;

  function checkAndFormat() {
    if (!changeId || curId != changeId) {
      return;
    }
    var newNumMessages = $(".Bk", $thread).length;
    if (newNumMessages > numMessages) {
      loadChange(changeId, function(resp) {
        if (!resp.success) {
          renderErrorBox(changeId, resp.err_msg);
          return;
        } else {
          reviewData = resp.data;
          numMessages = newNumMessages;
          doFormat();
          renderBox(changeId, reviewData);
        }
      });
    } else {
      doFormat();
    }
  }

  function doFormat() {
    $(".Bk", $thread).not(".gerrit-formatted").each(function() {

      if ($(this).html().indexOf("gmail_quote") >= 0) {
        // someone sent this email directly; don't format.
        // TODO: we need a much better way of detecting this!
        $(this).addClass("gerrit-formatted");
        return;
      }

      formatCard($(this), reviewData);
    });
    setTimeout(checkAndFormat, 1000);
  }

  doFormat();

  if (gSettings.email != reviewData.owner.email) {
    // Not my commit, so show me the last diff
    var $diffs = $(".show-diffs-button", $thread);
    $($diffs[$diffs.length-1]).click();
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
  var messageLines = message.split("\n");
  for (var i = 0; i < messageLines.length; i++) {
    var $line = $("<p/>").text(messageLines[i]).appendTo($header);
    if (i == 0) {
      $line.addClass("gerrit-header");
    }
  }

  $msg.append(renderRevisionDiff(reviewData, revId, null));
}

function extractCommitMessage(commit) {
  var message = commit.message;
  if (!message) {
    return undefined;
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

  var $comment = makeButton("Submit Comments").click(function() { collectAndSubmitComments(false); });
  var $commentApprove = makeButton("Submit Comments & Approve").click(function() { collectAndSubmitComments(true); });
  var replyWidget = new RespondWidget(makeButton("Comment"), [$comment, $commentApprove]);
  replyWidget.getWidget().addClass("primary").appendTo($box);

  $box.on("dblclick", ".gerrit-commentable", function() {
    replyWidget.open(false);
  });

  function collectAndSubmitComments(approve) {
    var review = {};
    if (replyWidget.getText().length > 0) {
      review.message = replyWidget.getText();
    }
    if (approve) {
      review.labels = {'Code-Review': 2};
    }
    $(".gerrit-reply-box.inlined textarea.gerrit-reply", $box).each(function() {
      var comment = $.trim($(this).val());
      if (comment.length == 0) {
        return;
      }
      var file = $(this).data("file");
      if (!("comments" in review)) {
        review.comments = {};
      }
      if (!(file in review.comments)) {
        review.comments[file] = [];
      }
      review.comments[file].push({line: $(this).data("line"), side: $(this).data("side"), message: comment});
    });

    submitComments(reviewData._number, revId, review, function(resp) {
      if (resp.success) {
        $(".gerrit-reply-box", $box).detach();
        replyWidget.close(true);
      }
      performActionCallback(reviewData._number, resp);
    });
  }

  return $container;
}

function renderFileBox(reviewData, revId, file, baseId) {
  var $filebox = $("<div class='gerrit-content-box'/>");
  $filebox.append($("<div class='gerrit-file-title'/>").text(file));

  loadDiff(reviewData._number, revId, file, baseId, function(resp) {
    if (resp.success) {
      $filebox.append(appendFileDiff($filebox, file, resp.data));
    } else {
      $filebox.append($("<div class='gerrit-error'/>").text("Error loading diff :'("));
    }
  });  
  return $filebox;
}

function appendFileDiff($box, file, data) {
  if (!data.diff_header || data.diff_header.length == 0) {
    // There's actually no difference!  Ignore this file entirely
    var $parent = $box.parent();
    $box.detach();
    if ($parent.children().length == 0) {
      // If everything got detached, leave a message saying why
      $parent.append($("<div/>").text("No changes!"));
    }
    return;
  }

  var contextLines = gSettings.contextLines || 3;
  var aLine = 1, bLine = 1;
  var curSection = 0;
  
  function renderHeader(text) {
    return $("<div class='gerrit-line-header'/>").text(text);
  }

  function renderLineHeader(a, b) {
    return renderHeader("@@ -" + a + ", +" + b + " @@");
  }

  function renderLine(texts, type) {
    if (typeof(texts) == "string") {
      texts = [texts];
    }
    var prefix = type == "new" ? "+ " : type == "old" ? "- " : "  ";
    var $line = $("<pre class='gerrit-line'/>").text(prefix).appendTo($box);
    if (type == "new") {
      $line.addClass("gerrit-new-line");
    } else if (type == "old") {
      $line.addClass("gerrit-old-line");
    } else if (texts.length == 0 || (texts.length == 1 && texts[0].length == 0)) {
      $line.addClass("gerrit-line-empty");
    }

    for (var i = 0; i < texts.length; i++) {
      var part = texts[i];
      if (typeof(part) == "string") {
        $line.append($("<span/>").text(part));
      } else if (part[0].length > 0) {
        var $part = $("<span/>").text(part[0]).appendTo($line);
        if (part[1]) {
          $part.addClass("gerrit-line-edit-part-" + type);
        }
      }
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

  function appendDiffLinesSide(lines, edits, type, lineStart) {
    function makeCommentable($line, num) {
      if (type == "old") {
        // Since we diff against the "last commented patch set", we're not really sure how
        // to comment on the "old" line, so we don't allow it
        return;
      }
      $line.addClass("gerrit-commentable").dblclick(function() {
        if ($line.data("gerrit-textBox")) {
          $line.data("gerrit-textBox").focus();
        } else {
          var $replyBox = $("<div class='gerrit-reply-box touched inlined'/>");
          var $textBox = $("<textarea class='gerrit-reply'/>")
            .data({line: num+lineStart, file:file, side: type == "old" ? "PARENT" : "REVISION"})
            .appendTo($replyBox);
          $replyBox.insertAfter($line);
          $textBox.focus();
          $line.data("gerrit-textBox", $textBox);
        }
      });
    }

    if (edits) {
      var segs = segmentEdits(lines, edits);
      for (var i = 0; i < segs.length; i++) {
        var $line = renderLine(segs[i], type).appendTo($box);
        makeCommentable($line, i);
      }
    } else {
      for (var i = 0; i < lines.length; i++) {
        var $line = renderLine([[lines[i], true]], type).appendTo($box);
        makeCommentable($line, i);
      }
    }
  }

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
        appendDiffLinesSide(section.a, section.edit_a, "old", aLine);
        aLine += section.a.length;
      }

      if ("b" in section) {
        appendDiffLinesSide(section.b, section.edit_b, "new", bLine);
        bLine += section.b.length;
      }

      // Collect some forward lines
      forwardLines = 0;
    }
    curSection += 1
  }
}

function segmentEdits(lines, edits) {
  var buffer = [];
  var segmentIndex = 0;
  var editIndex = 0;
  var editStartIndex = edits.length > 0 ? edits[0][0] : 0;

  for (var l = 0; l < lines.length; l++) {
    var line = lines[l];
    var lineIndex = 0;
    var lineBuffer = [];

    while (editIndex < edits.length) {
      var editEndIndex = editStartIndex + edits[editIndex][1];

      if (segmentIndex + lineIndex < editStartIndex) {
        // Consume up to the start of the next edit
        var len = Math.min(line.length - lineIndex, editStartIndex - lineIndex - segmentIndex);
        lineBuffer.push([line.substring(lineIndex, lineIndex + len), false]);
        lineIndex += len;
      }

      if (lineIndex >= line.length) {
        // done with this line!
        break;
      }

      if (segmentIndex + lineIndex >= editStartIndex && segmentIndex + lineIndex < editEndIndex) {
        // Currently in the middel of an edit; consume as much as we can
        var len = Math.min(line.length - lineIndex, editEndIndex - lineIndex - segmentIndex);
        lineBuffer.push([line.substring(lineIndex, lineIndex + len), true]);
        lineIndex += len;
      } 

      if (segmentIndex + lineIndex >= editEndIndex) {
        // If we've consumed the edit segment, and go to the next one
        editStartIndex += edits[editIndex][1];
        editIndex += 1;
        if (editIndex < edits.length) {
          editStartIndex += edits[editIndex][0];
        }
      }

      if (lineIndex >= line.length) {
        // done with this line!
        break;
      }
    }

    if (lineIndex < line.length) {
      lineBuffer.push([line.substring(lineIndex), false]);
    }

    buffer.push(lineBuffer);
    segmentIndex += line.length + 1;
  }

  return buffer;
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

function extractAndLoadMessageComments(reviewData, revId, text, callback) {
  loadAndCacheComments(reviewData, revId, function(resp) {
    if (!resp.success) {
      callback(resp);
    } else {
      var allComments = resp.data;

      function guessCommentId(file, lineComment) {
        for (var i = 0; i < allComments[file].length; i++) {
          var c = allComments[file][i];
          if (c.line == lineComment.line && c.message.indexOf(lineComment.comments.join("\n")) == 0) {
            return c.id;
          }
        }
        return undefined;
      }

      var messageComments = extractMessageComments(text);
      for (var i = 0; i < messageComments.fileComments.length; i++) {
        var fileComment = messageComments.fileComments[i];
        for (var j = 0; j < fileComment.lineComments.length; j++) {
          var lineComment = fileComment.lineComments[j];
          lineComment.id = guessCommentId(fileComment.file, lineComment);
        }
      }
      callback({success: true, data: messageComments});
    }
  });
}

function extractMessageComments(text) {
  var lines = text.split("\n");
  var index = 0;

  function collectLineComments() {
    var buffer = [];
    while (index < lines.length) {
      var line = lines[index];
      if (line == "--" || line.indexOf("Line ") == 0 || line.indexOf(".........") == 0) {
        break;
      }
      buffer.push(line);
      index += 1;
    }
    return trimEmptyLines(buffer);
  }

  function collectFileComments() {
    var buffer = [];
    while (index < lines.length) {
      var line = lines[index];
      if (line == "--" || line.indexOf("..............") == 0) {
        break;
      }
      if (line.indexOf("Line ") == 0 && _RE_LINE.test(line)) {
        var m = _RE_LINE.exec(line);
        index += 1;
        buffer.push({line: parseInt(m[1]), lineContent: m[2], comments: collectLineComments()});
      } else {
        index += 1;
      }
    }
    return buffer;
  }

  function collectFiles() {
    var buffer = [];
    var sawSeparator = false;
    while (index < lines.length) {
      var line = lines[index];
      if (line == "--") {
        break;
      } else if (line.indexOf("..................") == 0) {
        sawSeparator = true;
        index += 1;
      } else if (sawSeparator && line.indexOf("File ") == 0) {
        index += 1;
        buffer.push({file: _RE_FILE_NAME.exec(line)[1], lineComments: collectFileComments()});
        sawSeparator = false;
      } else {
        sawSeparator = false;
        index += 1;
      }
    }
    return buffer;
  }

  function collectPatchSetComments() {
    var buffer = [];
    var start = false;
    while (index < lines.length) {
      var line = lines[index];
      if (line == "--" || (start && line.indexOf("........................") == 0)) {
        break;
      } else if (line.indexOf("Patch Set ") == 0) {
        start = true;
        buffer.push(line);
        index += 1;
      } else if (start) {
        buffer.push(line);
        index += 1;
      } else {
        index += 1;
      }
    }
    return trimEmptyLines(buffer);
  }

  return {message: collectPatchSetComments(), fileComments: collectFiles()};
}

_RE_FILE_NAME = /^File (.*)$/
_RE_LINE = /^Line (\d+): (.*)$/

_RE_COMMENT_COUNT = /^\(\d+ comments?\)/

function makeButton(text, small, href) {
  var href = href || "javascript: void 0;";
  var $button = $("<a href='" + href + "' class='gerrit-button T-I J-J5-Ji lR T-I-ax7 ar7 T-I-JO'/>").text(text);
  if (small) {
    $button.addClass("gerrit-button-small");
  }
  return $button;
}

function RespondWidget($teaserButton, buttons) {
  var self = this;
  this.$buttons = $("<div/>");
  buttons.map(function($b) { $b.appendTo(self.$buttons); });
  if (buttons.length > 0) {
    this.$buttons.addClass("action-buttons");
  }

  this.$box = $("<div class='gerrit-reply-box'/>");

  this.$teaser = $("<div/>").appendTo(this.$box);

  $teaserButton.appendTo(this.$teaser).click(function() {
    self.open(true);
  });

  this.$replyBox = $("<textarea class='gerrit-reply'/>").appendTo(this.$box).hide();
  this.$content = $("<div class='gerrit-reply-content/>").appendTo(this.$box).hide();

  this.$buttons.appendTo(this.$box);

  this.close(true);
}

RespondWidget.prototype.open = function(focus) {
  this.$teaser.hide();
  this.$buttons.show();
  this.$replyBox.show();
  if (focus) {
    this.$replyBox.focus();
  }
  this.$box.addClass("touched");
};

RespondWidget.prototype.close = function(clear) {
  this.$buttons.hide();
  this.$teaser.show();
  this.$replyBox.hide();
  if (clear) {
    this.$replyBox.val("");
    this.$content.text("");
    this.$box.removeClass("touched");
  } else {
    var val = $this.replyBox.val();
    if (val) {
      this.$content.text($this.replyBox.val()).show();
    }
  }
};

RespondWidget.prototype.getText = function() {
  return this.$replyBox.val();
};

RespondWidget.prototype.getWidget = function() {
  return this.$box;
};

function formatComment($card, $msg, text, reviewData) {
  var pid = extractPatchSet(text);
  var revId = getRevisionIdByPatchNumber(reviewData, pid);
  $msg.empty();

  // It is hard to use the REST API and figure out which comments belong to
  // this email message, since the comments we get from the REST API are just
  // grouped together under a file, and we can't tell which belong to which
  // email message.  Here we have two separate heuristics -- one by looking
  // at the actual email content, and matching it with the ones we get
  // from the REST API to attach IDs to those comments.  Another is to try
  // to match this email message to one of the reviewData.messages, which is
  // also just a best-guess effort, and then to keep all comments created
  // with the same timestamp as the reviewData.message.  Both suck; extracting
  // from email body depends on Gerrit's email formatting, and also hopes
  // that no two people have made the same comment on the same line.  Using
  // the REST API entirely depends on the message having the same timestamp
  // as the comment, and also depends on the rather unreliable and fuzzy
  // matching from email message to reviewData.message.  By default, we extract
  // load from REST API, since the message body formatting changes from release
  // to release :-/

  /*
  var $commentsBox = $("<div/>").appendTo($msg);
  extractAndLoadMessageComments(reviewData, revId, text, function(resp) {
    if (!resp.success) {
      $commentsBox.append(renderError("Failed to load comments :'("));
    } else {
      appendMessageComments(resp.data);
    }
  });
  */

  var $commentsBox = $("<div/>").appendTo($msg);
  var lineReplyWidgets = [];

  loadMessageComments($card, text, reviewData, revId, function(resp) {
    if (!resp.success) {
      $commentsBox.append(renderError("Failed to load comments :'("));
    } else {
      appendMessageComments(resp.data);
    }
  });

  var $submit = makeButton("Submit Comments").click(function() { collectAndSubmitComments(false); });
  var $submitApprove = makeButton("Submit Comments & Approve").click(function() { collectAndSubmitComments(true); });
  var messageReplyWidget = new RespondWidget(makeButton("Reply"), [$submit, $submitApprove]);
  messageReplyWidget.getWidget().addClass("primary").appendTo($msg);
  
  function appendMessageComments(messageComments) {
    var $header = $("<div/>").appendTo($commentsBox);
    for (var i = 0; i < messageComments.message.length; i++) {
      var ptext = messageComments.message[i];
      var $line = $("<p/>").text(ptext);
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

    for (var i = 0; i < messageComments.fileComments.length; i++) {
      var fileComment = messageComments.fileComments[i];
      if (fileComment.lineComments.length == 0) {
        continue;
      }
      var $filebox = $("<div class='gerrit-content-box'/>").appendTo($commentsBox);
      $filebox.append($("<div class='gerrit-file-title'/>").text(fileComment.file));
      for (var j = 0; j < fileComment.lineComments.length; j++) {
        var comment = fileComment.lineComments[j];
        $("<br/>").appendTo($filebox);
        $("<pre class='gerrit-line'/>").text("Line " + comment.line + ": " + comment.lineContent).appendTo($filebox);
        for (var k = 0; k < comment.comments.length; k++) {
          $("<div/>").text(comment.comments[k]).appendTo($filebox);
        }
        var lineReplyWidget = new RespondWidget(makeButton("Reply", true), []);
        lineReplyWidget.getWidget().appendTo($filebox);
        lineReplyWidget.$teaser.click(function() { messageReplyWidget.open(false); });
        lineReplyWidgets.push({widget: lineReplyWidget, file: fileComment.file, line: comment.line, parent: comment.id});
      }
    }
  }

  function collectAndSubmitComments(approve) {
    var review = {};
    if (messageReplyWidget.getText().length > 0) {
      review.message = messageReplyWidget.getText();
    }
    if (approve) {
      review.labels = {'Code-Review': 2};
    }
    for (var i = 0; i < lineReplyWidgets.length; i++) {
      var lw = lineReplyWidgets[i];
      if (lw.widget.getText().length > 0) {
        if (!("comments" in review)) {
          review.comments = {};
        }
        if (!(lw.file in review.comments)) {
          review.comments[lw.file] = [];
        }
        review.comments[lw.file].push({line: lw.line, message: lw.widget.getText(), in_reply_to: lw.parent});
      }
    }
    console.log("REVIEW", review);
    submitComments(reviewData._number, revId, review, function(resp) {
      if (resp.success) {
        for (var i = 0; i < lineReplyWidgets.length; i++) {
          lineReplyWidgets[i].widget.close(true);
        }
        messageReplyWidget.close(true);
      }
      performActionCallback(reviewData._number, resp);
    });
  }
}

function loadMessageComments($card, text, reviewData, revId, callback) {
  var gMsg = undefined;

  function loadFileComments(file, allComments) {
    var deferred = $.Deferred();
    loadAndCacheFileContent(reviewData, revId, file, function(resp) {
      if (!resp.success) {
        deferred.resolve(resp);
      } else {
        var fileComments = allComments[file].filter(function(c) {return c.author.email == gMsg.author.email && c.updated == gMsg.date});
        var content = resp.data.split("\n");
        var lineComments = [];
        for (var i = 0; i < fileComments.length; i++) {
          var fc = fileComments[i];
          var lineContent = fc.side == "PARENT" ? "(unavailable...)" : content[fc.line-1];
          lineComments.push({id: fc.id, line: fc.line, lineContent: lineContent, comments: fc.message.split("\n")});
        }
        deferred.resolve({success: true, data: {file: file, lineComments: lineComments}});
      }
    });
    return deferred;
  }

  loadAndCacheComments(reviewData, revId, function(resp) {
    if (!resp.success) {
      callback(resp);
      return;
    }
    var allComments = resp.data;

    gMsg = guessGerritMessage($card, text, revId, reviewData);
    console.log("MATCHED", gMsg);

    var deferreds = [];
    for (var file in allComments) {
      deferreds.push(loadFileComments(file, allComments));
    }
    $.when.apply($, deferreds).done(function() {
      var resps = arguments;
      var fileComments = [];
      for (var i = 0; i < resps.length; i++) {
        if (!resps[i].success) {
          callback(resps[i]);
          return;
        } else {
          fileComments.push(resps[i].data);
        }
      }
      callback({success: true, data: {message: gMsg.message.split("\n"), fileComments: fileComments}});
    });

    return {message: gMsg.message.split("\n")};
  });
}
 
function crunch(string) {
  return $.trim(string.replace(/\s+/g, " "));
}

function guessGerritMessage($card, text, revId, reviewData) {
  // TODO: this tries to match a Gmail $card with a reviewData.messages.
  // Very fragile!  Surely there's a better way???
  var pid = reviewData.revisions[revId]._number;
  var cardFrom = $("span.gD", $card).text();
  var allComments = reviewData.revisions[revId].comments;

  var textCrunched = crunch(text);
  for (var i = reviewData.messages.length-1; i >= 0; i--) {
    var msg = reviewData.messages[i];
    if (!msg.author) {
      // Gerrit-generated messages (like merge failed) do not have an author
      continue;
    }
    if (msg._revision_number != pid) {
      continue;
    }
    if (textCrunched.indexOf(crunch(msg.message)) < 0) {
      continue;
    }
    if (!(cardFrom.indexOf(msg.author.name) >= 0 || 
          cardFrom.indexOf(msg.author.email) >= 0 ||
          cardFrom.indexOf(msg.author.username) >= 0)) {
      continue;
    }
    if (allComments && !matchFileComments(msg)) {
      continue;
    }

    return msg;
  }

  function matchFileComments(msg) {
    // Here's the idea: we basically want to make sure the message we are returning actually
    // contains textual comments for the $card that we're looking to match to.  To do this,
    // we reject message if it's created at the same time as a comment whose text cannot be
    // found in the email text.  We're basically using the timestamp to join the message to
    // the email message text.
    for (var file in allComments) {    
      var comments = allComments[file];
      for (var c = 0; c < comments.length; c++) {
        var comment = comments[c];
        if (comment.author.email == msg.author.email && comment.updated == msg.date && textCrunched.indexOf(crunch(comment.message)) < 0) {
          return false;
        }
      }
    }
    return true;
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

function trimEmptyLines(lines) {
  var start;
  for (start = 0; start < lines.length; start++) {
    if (lines[start].length > 0) {
      break;
    }
  }
  var end;
  for (end = lines.length-1; end>=start; end--) {
    if (lines[end].length > 0) {
      break;
    }
  }
  return lines.slice(start, end + 1);
}

var RE_PATCHSET = /Gerrit-PatchSet: (\d+)/;
function extractPatchSet(text) {
  return parseInt(RE_PATCHSET.exec(text)[1]);
}

function formatNewPatch($card, $msg, text, reviewData) {
  var pid = extractPatchSet(text);
  var basePid = guessNewPatchBase(pid, reviewData);

  $msg.empty().html("<h3>New Patch Set: " + pid + (basePid ? " (vs " + basePid + ")" : "") + "</h3>");
  
  var revId = getRevisionIdByPatchNumber(reviewData, pid);
  $msg.append(renderRevisionDiff(reviewData, revId, basePid));
}

function guessNewPatchBase(pid, reviewData) {
  // Guess the best "base" to diff against.  It's going to be the last one that was
  // commented upon by someone other than the author.

  for (var i = reviewData.messages.length - 1; i >= 0; i--) {
    var msg = reviewData.messages[i];
    if (!msg.author) {
      // Messages sent by Gerrit have no author
      continue;
    }
    if (msg._revision_number < pid && msg.author.username != reviewData.owner.username) {
      return msg._revision_number;
    }
  }
  return undefined;
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
  changeId = null;
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
  chrome.runtime.sendMessage({type: "viewDiff", id: id});  
}

function commentDiff(id, approve, comment, callback) {
  var commentText = null;
  if (comment) {
    commentText = prompt("Say your piece.");
    if (!commentText) {
      return;
    }
  }
  authenticatedSend({type: "commentDiff", id: id, approve: approve, comment: commentText}, callback);
}

function approveSubmitDiff(id, callback) {
  function submitCallback(resp) {
    if (!resp.success && resp.status == 409) {
      console.log("Submit failed; automatically rebasing...");
      rebaseSubmitChange(id, callback);
    } else {
      callback(resp);
    }
  }
  authenticatedSend({type: "approveSubmitDiff", id: id}, submitCallback);
}

function submitDiff(id, callback) {
  authenticatedSend({type: "submitDiff", id: id}, callback);
}

function rebaseChange(id, callback) {
  authenticatedSend({type: "rebaseChange", id: id}, callback);
}

function submitComments(id, revId, review, callback) {
  authenticatedSend({type: "submitComments", id: id, revId: revId, review: review}, callback);
}

function rebaseSubmitChange(id, callback) {
  function rebaseCallback(resp) {
    if (!resp.success) {
      callback(resp);
    } else {
      authenticatedSend({type: "submitDiff", id: id}, callback);
    }
  }
  rebaseChange(id, rebaseCallback);
}

function initialize() {
  loadSettings(function(settings) {
    gSettings.url = settings.url;
    gSettings.contextLines = settings.contextLines;

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
  for (var i = 0; i < $anchor.length; i++) {
    var url = $($anchor[i]).attr("href");
    var id = extractDiffIdFromUrl(url);
    if (id) {
      return id;
    }
  }
  return null;
}

function checkDiff() {
  var id = extractDiffId();
  console.log("Found change", id);
  if (id != changeId) {
    clearDiff();
    if (id) {
      renderChange(id);
    }
  }
}

function handleKeyPress(e) {
  var $target = $(e.target);
  if ($target.hasClass("editable") || $target.prop("tagName").toLowerCase() == "input" || $target.prop("tagName").toLowerCase() == "textarea") {
    return;
  }
  if (changeId) {
    if (e.which == 119) {
      viewDiff(changeId);
    } else if (e.which == 87) {
      commentDiff(changeId, true, false, function(resp) { performActionCallback(changeId, resp); });
    }
  }
}

$(function() {
  setTimeout(initialize, 3000);
});