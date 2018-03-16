const gSettings = {};
let dom = null;
let changeGerritUrl = null;
let changeId = null;
let tracker = null;
const re_rgid = new RegExp(".*/(\\d+)$");

const $sideBox = $("<div class='nH gerrit-box gerrit-sidebox'/>");


function labeledValue(label, value) {
  if (value === 0) { return undefined; }
  else if (value > 0) { return label + "+" + value; }
  else { return label + value; }
}

function extractReviewers(data, selfEmail) {
  const reviewers = {};
  function mkrev(rev) {
    return {
      name: rev.name, email: rev.email, login: reviewerKey(rev),
      self: rev.email === selfEmail, labels: []
    };
  }
  function reviewerKey(rev) {
    return rev.username || rev.email;
  }
  function addReviewersForLabel(label) {
    if (data.labels && data.labels[label] && data.labels[label].all) {
      for (const rev of data.labels[label].all) {
        const rk = reviewerKey(rev);
        const reviewer = rk in reviewers ? reviewers[rk] : mkrev(rev);
        if (rev.value !== 0) {
          reviewer.labels.push(labeledValue(label, rev.value));
        }
        reviewers[rk] = reviewer;
      }
    }
  }
  const allLabels = _.keys(data.labels);
  for (const label of allLabels) {
    addReviewersForLabel(label);
  }
  if (data.reviewers && data.reviewers.REVIEWER) {
    for (const rev of data.reviewers.REVIEWER) {
      const rk = reviewerKey(rev);
      if (!rk in reviewers) {
        reviewers[rk] = mkrev(rev);
      }
    }
  }
  return _.values(reviewers);
}

async function loadAndRenderBox(gerritUrl, id) {
  const resp = await loadChange(gerritUrl, id);
  if (!resp.success) {
    renderErrorBox(gerritUrl, id, resp.err_msg);
  } else {
    renderBox(gerritUrl, id, resp.data);
  }
}

function performActionCallback(gerritUrl, id, resp) {
  if (!resp.success) {
    renderErrorBox(gerritUrl, id, resp.err_msg);
  } else {
    loadAndRenderBox(gerritUrl, id);
  }
}

function renderErrorBox(gerritUrl, id, err_msg) {
  const instance = getGerritInstance(gerritUrl);
  $sideBox.empty();
  makeInfoBoxHeader(gerritUrl, id, "Error").appendTo($sideBox);
  $("<div class='note gerrit-error'/>").text(err_msg).appendTo($sideBox);
  if (!instance.auth) {
    $("<div class='gerrit-sidebox-buttons'/>").appendTo($sideBox)
      .append(makeButton("Login", {href: gerritUrl, primary: true}).appendTo($sideBox))
      .append(makeButton("Try again").appendTo($sideBox).click(() => renderChange(gerritUrl, id)));
  }
}

function makeInfoBoxHeader(gerritUrl, id, status) {
  const $header = $("<h4/>");
  $("<img title='Gerrit'/>").prop("src", chrome.extension.getURL("icons/gerrit-big.png")).appendTo($header);
  const $link = $("<a target='_blank'/>").prop("href", `gerritUrl/${id}`).text(id).appendTo($header);
  $("<span>: </span>").appendTo($header);
  const $status = $("<span class='status'/>").text(status).appendTo($header);
  if (status == "Error" || status == "Failed Verify" || status == "Rejected" || status == "Cannot Merge") {
    $status.addClass("red");
  } else if (status == "Approved" || status == "Merged") {
    $status.addClass("green");
  }
  return $header;
}

function undefinedOrTrue(val) {
  return val === undefined || val === true;
}

function maxPermittedCodeReviewScore(reviewData) {
  if (!reviewData.permitted_labels) {
    return undefined;
  }
  const range = reviewData.permitted_labels["Code-Review"];
  if (!range || !range.length > 0) {
    return undefined;
  }
  return parseInt(range[range.length-1]);
}

function maxCodeReviewScore(reviewData) {
  if (!reviewData.labels || !reviewData.labels["Code-Review"] || !reviewData.labels["Code-Review"].values) {
    return undefined;
  }
  const values = _.keys(reviewData.labels["Code-Review"].values).map(parseInt);
  return _.max(values);
}

function renderBox(gerritUrl, id, reviewData) {
  $sideBox.empty();

  const instance = getGerritInstance(gerritUrl);
  const status = reviewStatus(instance, reviewData);
  const isOwner = isChangeOwner(reviewData, instance.email);
  const isReviewer = isChangeReviewer(reviewData, instance.email);
  const reviewers = extractReviewers(reviewData, instance.email);
  const maxCRScore = maxCodeReviewScore(reviewData);

  makeInfoBoxHeader(gerritUrl, id, status).appendTo($sideBox);

  const $content = $("<div class='gerrit-sidebox-content'/>").appendTo($sideBox);
  const $reviewers = $("<div class='note reviewers'/>").appendTo($content);
  $("<span class='note-title'/>").text("Reviewers: ").appendTo($reviewers);
  _.forEach(reviewers, (reviewer, index) => {
    const allLabels = reviewer.labels.join(",");
    const reviewerClass = (
      allLabels.indexOf(`Code-Review+${maxCRScore}`) >= 0 ?
        "reviewer-approved" :
      allLabels.indexOf("Verified+1") >= 0 ?
        "reviewer-verified" :
      allLabels.indexOf("Code-Review-") >= 0 ?
        "reviewer-approved-failed" :
      allLabels.indexOf("Verified-") >= 0 ?
        "reviewer-verified-failed" :
      ""
    );
    const $reviewer = $("<span/>").addClass(reviewerClass).text(reviewer.name || reviewer.login);
    if (index > 0) {
      $("<span>, </span>").appendTo($reviewers);
    }
    $reviewer.appendTo($reviewers);
  });

  const perform = async (action, promise) => {
    const resp = await promise;
    if (promise) {
      performActionCallback(gerritUrl, id, resp);
      tracker.sendEvent("infobox", "click", action);
    }
  }

  const $basicButtons = $("<div class='gerrit-sidebox-buttons'/>").appendTo($content);
  $basicButtons.append(makeButton("View").click(() => {
    viewDiff(gerritUrl, id)
    tracker.sendEvent("infobox", "click", "view");
  }));
  if (status === "Failed Verify") {
    const link = findFailedLink(reviewData, instance);
    if (link) {
      $basicButtons.append(makeButton("See Error", {href: link}).addClass("error-button"));
    }
  }
  $basicButtons.append(makeButton("Comment").click(() => perform("comment", commentDiff(gerritUrl, id, undefined, true))));

  if (status === "Approved") {
    if (isOwner && canSubmit(reviewData)) {
      $("<div class='gerrit-sidebox-buttons'/>").appendTo($content)
        .append(makeButton("Submit").addClass("submit-button").click(() => perform("submit", submitDiff(gerritUrl, id))));
    }
  } else if (status === "Merge Pending" || status === "Cannot Merge") {
    if (isOwner) {
      $("<div class='gerrit-sidebox-buttons'/>").appendTo($content)
        .append(makeButton("Rebase", {side: "left"}).click(() => perform("rebase", rebaseChange(gerritUrl, id))))
        .append(makeButton("& submit", {side: "right"}).click(() => perform("rebase_submit", rebaseSubmitChange(gerritUrl, id))));
    }
  } else if ((isReviewer || isOwner) && ["Merged", "Abandoned", "Merge Pending"].indexOf(status) < 0) {
    const maxPermittedScore = maxPermittedCodeReviewScore(reviewData);
    const $approveButtons = $("<div class='gerrit-sidebox-buttons'/>").appendTo($content);
    if (maxPermittedScore !== undefined && maxPermittedScore > 0) {
      $approveButtons.append(
        makeButton(
          "Approve" + (maxPermittedScore != 2 ? ` (+${maxPermittedScore})` : ""), 
          {side: "left"}).click(() => perform("approve", commentDiff(gerritUrl, id, maxPermittedScore, false))));
      if (isOwner) {
        $approveButtons.append(makeButton("& submit", {side: "right"}).click(() => perform("approve_submit", approveSubmitDiff(gerritUrl, id, maxPermittedScore))));
      } else if (isReviewer) {
        $approveButtons.append(makeButton("& comment", {side: "right"}).addClass("").click(() => perform("approve_comment", commentDiff(gerritUrl, id, maxPermittedScore, true))));
      }
    }
  }
  return $content;
}

function findFailedLink(instance, reviewData) {
  const lastFailedMessageIndex = _.findLastIndex(reviewData.messages, m => isBot(m.author.username, instance) && m.message.indexOf("Verified-1") >= 0);
  if (lastFailedMessageIndex >= 0) {
    const failedMessage = reviewData.messages[lastFailedMessageIndex].message;
    const links = linkify.find(failedMessage);
    if (links.length > 0) {
      return links[0].href;
    }
  }
  return undefined;
}

async function renderChange(gerritUrl, id) {
  changeGerritUrl = gerritUrl;
  changeId = id;

  const $sidebarBoxes = dom.sideBoxContainer();
  $sideBox.empty().prependTo($sidebarBoxes);

  const resp = await loadChange(gerritUrl, id);
  if (!resp.success) {
    renderErrorBox(gerritUrl, id, resp.err_msg);
    return;
  }
  const data = resp.data;

  tracker.sendAppView("thread");

  renderBox(gerritUrl, id, data);

  formatThread(gerritUrl, id, data);
}

async function authenticatedSend(msg) {
  async function authAndSend() {
    const resp = await authenticate(msg.url);
    if (resp.success) {
      return await sendMessage(msg);
    } else {
      console.log("Still failed to authenticate :'(");
      showNeedLogin();
      return {success: false, status: 403, err_msg: "Cannot authenticate"};
    }
  }

  const instance = getGerritInstance(msg.url);
  if (!instance.auth) {
    console.log("Not authenticated! authenticate first...");
    return await authAndSend();
  } else {
    const resp = await sendMessage(msg);
    if (!resp.success && resp.status === 403) {
      console.log("Send failed; try to authenticate again", resp);
      return await authAndSend();
    } else {
      return resp;
    }
  }
}

function flashMessage(msg) {
  dom.flashMessage(msg);
}

async function sendMessage(msg) {
  tracker.sendEvent("message", "send", msg.type);
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, function(resp) {
        console.log("Function call: " + JSON.stringify(msg), resp);
        resolve(resp);
      });
    } catch(err) {
      resolve({success: false, err_msg: "Gerrit extension has been updated to a new version. Please reload your Gmail or Inbox tab!"});
      flashMessage("Oops, Gerrit extension has been updated to a new version. Please reload your Gmail or Inbox tab!");
      tracker.sendAppView("extension_updated");
    }
  });
}

async function loadChange(url, id) {
  return authenticatedSend({type: "loadChange", url, id});
}

async function loadChanges(url) {
  return authenticatedSend({type: "loadChanges", url});
}


async function loadDiff(url, id, revId, file, baseId) {
  return authenticatedSend({type: "loadDiff", url, id, revId, file, baseId});
}

async function loadAndCacheDiff(gerritUrl, reviewData, revId, file, baseId) {
  const rev = reviewData.revisions[revId];
  if (!rev.diffs) {
    rev.diffs = {};
  }
  if (!rev.diffs[file]) {
    rev.diffs[file] = {};
  }
  const makePromise = function() {
    return loadDiff(gerritUrl, reviewData._number, revId, file, baseId);
  };
  return loadAndCache(rev.diffs[file], baseId, makePromise);
}

async function loadAndCache(obj, prop, promiser) {
  const promiseProp = "__promise_" + prop;
  if (!obj[promiseProp]) {
    obj[promiseProp] = promiser().then((res) => {
      if (res.success) {
        obj[prop] = res.data;
      }
      return res;
    });
  }
  return obj[promiseProp];
}

async function loadAndCacheComments(gerritUrl, reviewData) {
  const makePromise = function() {
    return loadComments(gerritUrl, reviewData._number);
  };
  return loadAndCache(reviewData, "comments", makePromise);
}

function loadComments(url, id) {
  return authenticatedSend({type: "loadComments", url, id});
}

function renderError(text) {
  return $("<div class='gerrit-error'/>").text(text);
}

async function formatThread(gerritUrl, id, reviewData) {
  const $thread = dom.getThread();

  let numMessages = dom.getCards($thread).length;

  async function checkAndFormat() {
    if (!changeId || !changeGerritUrl || id !== changeId || gerritUrl !== changeGerritUrl) {
      observer.disconnect();
      $thread.data("gerritUrl", undefined);
      $thread.data("gerritDiffId", undefined);
      return;
    }
    const newNumMessages = dom.getCards($thread).length;
    if (newNumMessages > numMessages) {
      const resp = await loadChange(gerritUrl, changeId);
      if (!resp.success) {
        renderErrorBox(gerritUrl, changeId, resp.err_msg);
      } else {
        reviewData = resp.data;
        numMessages = newNumMessages;
        doFormat();
        renderBox(gerritUrl, changeId, reviewData);
      }
    } else {
      doFormat();
    }
  }

  const observer = new MutationObserver(_.debounce(checkAndFormat, 500));
  observer.observe($thread[0], {childList: true, subtree: true});

  function doFormat() {
    dom.getCards($thread).each(function() {
      formatCard(gerritUrl, $(this), reviewData);
    });
    dom.onThreadFormatted($thread);
  }

  doFormat();
  tracker.sendEvent("render", "annotate", "thread");
}

function formatCard(gerritUrl, $card, reviewData) {
  const $msg = dom.getMessage($card);
  if ($msg.length == 0 || $msg.data("gerritFormatted")) {
    return;
  } else if ($msg.html().indexOf("gmail_quote") >= 0) {
    // someone sent this email directly; don't format.
    // TODO: we need a much better way of detecting this!
    $msg.data("gerritFormatted", true);
    return;
  }

  const text = $msg.text();
  if (!$.trim(text)) {
    return;
  }

  if (/Gerrit-MessageType: newchange/gm.test(text)) {
    formatNewChange(gerritUrl, $card, $msg, text, reviewData);
  } else if (/Gerrit-MessageType: comment/gm.test(text)) {
    formatComment(gerritUrl, $card, $msg, text, reviewData);
  } else if (/Gerrit-MessageType: merged/gm.test(text)) {
    formatMerged($card, $msg, text, reviewData);
  } else if (/Gerrit-MessageType: merge-failed/gm.test(text)) {
    formatMergeFailed($card, $msg, text, reviewData);
  } else if (/Gerrit-MessageType: newpatchset/gm.test(text)) {
    formatNewPatch(gerritUrl, $card, $msg, text, reviewData);
  }
  $card.data("gerritFormatted", true);
  tracker.sendEvent("render", "annotate", "card");
}

function getRevisionIdByPatchNumber(reviewData, patchNumber) {
  for (const k in reviewData['revisions']) {
    if (reviewData['revisions'][k]._number === patchNumber) {
      return k;
    }
  }
  return undefined;
}

function formatNewChange(gerritUrl, $card, $msg, text, reviewData) {
  $msg.empty();

  const pid = extractPatchSet(text);
  const revId = getRevisionIdByPatchNumber(reviewData, pid);

  const $header = $("<div class='gerrit-highlight-box'/>").appendTo($msg);
  const revision = reviewData.revisions[revId];
  const message = extractCommitMessage(revision.commit);
  const messageLines = message.split("\n");
  for (let i = 0; i < messageLines.length; i++) {
    const $line = $("<div/>").html(linkifyStr(messageLines[i] + "\xA0")).appendTo($header);
    if (i === 0) {
      $line.addClass("gerrit-header");
    }
  }

  $msg.append(renderRevisionDiff(gerritUrl, reviewData, revId, null));
}

function extractCommitMessage(commit) {
  let message = commit.message;
  if (!message) {
    return undefined;
  }
  const changeIndex = message.indexOf("Change-Id: ");
  if (changeIndex >= 0) {
    message = message.substring(0, changeIndex);
  }
  return $.trim(message);
}

function renderRevisionDiff(gerritUrl, reviewData, revId, baseId) {
  const $container = $("<div/>");
  const $buttons = $("<div/>").appendTo($container);
  const $toggle = makeButton("Show diffs")
    .appendTo($buttons)
    .addClass("show-diffs-button")
    .css({margin: "10px 0"})
    .click(() => {
      if ($toggle.hasClass("showing")) {
        $toggle.text("Show diffs");
        $box.hide();
        $toggle.removeClass("showing");
      } else {
        showBox();
      }
    });

  function showBox() {
    $toggle.text("Hide diffs");
    $box.show();
    renderBox();
    $toggle.addClass("showing");
  }

  const $box = $("<div/>").appendTo($container).hide();

  function renderBox() {
    if ($box.data("gerrit-rendered")) {
      return;
    }
    $box.data("gerrit-rendered", true);
    const files = reviewData.revisions[revId].files;
    for (const file in files) {
      if (file === "/COMMIT_MSG") {
        continue;
      }
      renderFileBox(gerritUrl, reviewData, revId, file, baseId).appendTo($box);
    }
  
    const respondButtons = [
      makeButton("Submit Comments", {primary: true}).click(function() { collectAndSubmitComments(false); })
    ];
    const maxPermittedScore = maxPermittedCodeReviewScore(reviewData);
    if (maxPermittedScore > 0) {
      respondButtons.push(
        makeButton(
          "Submit Comments & Approve" + (maxPermittedScore != 2 ? ` (+${maxPermittedScore})` : "")
        ).click(function() { collectAndSubmitComments(true); }));
    }
    const replyWidget = new RespondWidget(
      makeButton("Comment").click(() => tracker.sendEvent("diff", "add_comment", "patchset")), 
      respondButtons);
    replyWidget.getWidget().addClass("primary").appendTo($box);

    const openReplyWidget = function() {
      replyWidget.open(false);
    };
    $box.on("dblclick", ".gerrit-commentable", openReplyWidget);
    $box.on("click", ".gerrit-add-comment", openReplyWidget);
  
    async function collectAndSubmitComments(approve) {
      const review = {};
      if (replyWidget.getText().length > 0) {
        review.message = replyWidget.getText();
      }
      if (approve) {
        review.labels = {'Code-Review': maxPermittedScore};
      }
      $(".gerrit-reply-box.inlined textarea.gerrit-reply", $box).each(function() {
        const comment = $.trim($(this).val());
        if (comment.length === 0) {
          return;
        }
        const file = $(this).data("file");
        if (!("comments" in review)) {
          review.comments = {};
        }
        if (!(file in review.comments)) {
          review.comments[file] = [];
        }
        review.comments[file].push({line: $(this).data("line"), side: $(this).data("side"), message: comment});
      });
  
      const resp = await submitComments(gerritUrl, reviewData._number, revId, review);
      tracker.sendEvent("diff", "submit_comments");
      if (resp.success) {
        $(".gerrit-reply-box", $box).detach();
        replyWidget.close(true);
      }
      performActionCallback(gerritUrl, reviewData._number, resp);
    }
  }  

  // if this is the last revision, then show its diffs if not own review
  const instance = getGerritInstance(gerritUrl);
  if (instance.email !== reviewData.owner.email) {
    const maxRevId = _.max(_.pairs(reviewData.revisions), p => p[1]._number)[0];
    if (maxRevId === revId) {
      showBox();
    }
  }  

  return $container;
}

function renderFileBox(gerritUrl, reviewData, revId, file, baseId) {
  const $filebox = $("<div class='gerrit-content-box'/>");
  $filebox.append($("<div class='gerrit-file-title'/>").text(file));

  loadAndCacheDiff(gerritUrl, reviewData, revId, file, baseId).then(function(resp) {
    if (resp.success) {
      $filebox.append(appendFileDiff($filebox, file, resp.data));
    } else {
      $filebox.append(renderError("Error loading diff :'("));
    }
  });
  return $filebox;
}

function appendFileDiff($box, file, data) {
  if (!data.diff_header || data.diff_header.length === 0) {
    // There's actually no difference!  Ignore this file entirely
    const $parent = $box.parent();
    $box.detach();
    if ($parent.children().length === 0) {
      // If everything got detached, leave a message saying why
      $parent.append($("<div/>").text("No changes!"));
    }
    return;
  }

  const contextLines = gSettings.contextLines || 3;
  let aLine = 1, bLine = 1;
  let curSection = 0;
  
  function renderHeader(text) {
    return $("<div class='gerrit-line-header'/>").text(text);
  }

  function renderLineHeader(a, b) {
    return renderHeader("@@ -" + a + ", +" + b + " @@");
  }

  function renderLine(texts, type) {
    if (typeof(texts) === "string") {
      texts = [texts];
    }
    const prefix = type === "new" ? "+ " : type === "old" ? "- " : "  ";
    const $line = $("<pre class='gerrit-line'/>").text(prefix).appendTo($box);
    if (type === "new") {
      $line.addClass("gerrit-new-line");
    } else if (type === "old") {
      $line.addClass("gerrit-old-line");
    } else if (texts.length === 0 || (texts.length === 1 && texts[0].length === 0)) {
      $line.addClass("gerrit-line-empty");
    }

    for (const part of texts) {
      if (typeof(part) === "string") {
        $line.append($("<span/>").text(part));
      } else if (part[0].length > 0) {
        const $part = $("<span/>").text(part[0]).appendTo($line);
        if (part[1]) {
          $part.addClass("gerrit-line-edit-part-" + type);
        }
      }
    }

    return $line;
  }

  if (data.change_type === "ADDED") {
    $box.append(renderHeader("(NEW FILE)"));
  } else if (data.change_type === "DELETED") {
    $box.append(renderHeader("(DELETED FILE)"));
  } else if (data.change_type === "RENAMED") {
    $box.append(renderHeader("(FILE RENAMED)"));
  }

  $box.append(renderLine(data.diff_header[data.diff_header.length-2]).addClass("gerrit-old-line"));
  $box.append(renderLine(data.diff_header[data.diff_header.length-1]).addClass("gerrit-new-line"));

  function appendDiffLinesSide(lines, edits, type, lineStart) {
    function makeCommentable($line, num) {
      if (type === "old") {
        // Since we diff against the "last commented patch set", we're not really sure how
        // to comment on the "old" line, so we don't allow it
        return;
      }
      const onAddComment = function() {
        if ($line.data("gerrit-textBox")) {
          $line.data("gerrit-textBox").focus();
        } else {
          const $replyBox = $("<div class='gerrit-reply-box touched inlined'/>");
          const $textBox = $("<textarea class='gerrit-reply'/>")
            .data({line: num+lineStart, file:file, side: type === "old" ? "PARENT" : "REVISION"})
            .appendTo($replyBox);
          $replyBox.insertAfter($line);
          $textBox.focus();
          $line.data("gerrit-textBox", $textBox);
        }
        tracker.sendEvent("diff", "add_comment", "line");
      };
      $line.addClass("gerrit-commentable").dblclick(onAddComment);
      $("<img class='gerrit-add-comment'/>").prop("src", chrome.extension.getURL("icons/add-comment.png")).click(onAddComment).appendTo($line);
    }

    if (edits) {
      const segs = segmentEdits(lines, edits);
      for (let i = 0; i < segs.length; i++) {
        const $line = renderLine(segs[i], type).appendTo($box);
        makeCommentable($line, i);
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        const $line = renderLine([[lines[i], true]], type).appendTo($box);
        makeCommentable($line, i);
      }
    }
  }

  let forwardLines = -1;
  while (curSection < data.content.length) {
    const section = data.content[curSection];
    if ("ab" in section) {
      aLine += section.ab.length;
      bLine += section.ab.length;
      if (forwardLines >= 0) {
        const toAppend = Math.min(section.ab.length, contextLines - forwardLines);
        for (let i = 0; i < toAppend; i++) {
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
          const backSection = data.content[curSection - 1];
          const backLines = Math.min(backSection.ab.length, contextLines);
          $box.append(renderLineHeader(aLine-backLines, bLine-backLines));
  
          for (let i = backSection.ab.length - backLines; i < backSection.ab.length; i++) {
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
  const buffer = [];
  let segmentIndex = 0;
  let editIndex = 0;
  let editStartIndex = edits.length > 0 ? edits[0][0] : 0;

  for (const line of lines) {
    let lineIndex = 0;
    const lineBuffer = [];

    while (editIndex < edits.length) {
      const editEndIndex = editStartIndex + edits[editIndex][1];

      if (segmentIndex + lineIndex < editStartIndex) {
        // Consume up to the start of the next edit
        const len = Math.min(line.length - lineIndex, editStartIndex - lineIndex - segmentIndex);
        lineBuffer.push([line.substring(lineIndex, lineIndex + len), false]);
        lineIndex += len;
      }

      if (lineIndex >= line.length) {
        // done with this line!
        break;
      }

      if (segmentIndex + lineIndex >= editStartIndex && segmentIndex + lineIndex < editEndIndex) {
        // Currently in the middel of an edit; consume as much as we can
        const len = Math.min(line.length - lineIndex, editEndIndex - lineIndex - segmentIndex);
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

function makeButton(text, opts) {
  const {small, href, primary, side} = opts || {};
  const $button = dom.makeButton(primary, side).text(text);
  if (href) {
    $button.prop("href", href);
  }
  if (small) {
    $button.addClass("gerrit-button-small");
  }
  return $button;
}

class RespondWidget {
  constructor($teaserButton, buttons) {
    this.$buttons = $("<div/>");
    buttons.forEach($b => $b.appendTo(this.$buttons));

    if (buttons.length > 0) {
      this.$buttons.addClass("action-buttons");
    }

    this.$box = $("<div class='gerrit-reply-box'/>");

    this.$teaser = $("<div/>").appendTo(this.$box);

    $teaserButton.appendTo(this.$teaser).click(() => this.open(true));

    this.$replyBox = $("<textarea class='gerrit-reply'/>").appendTo(this.$box).hide();
    this.$content = $("<div class='gerrit-reply-content/>").appendTo(this.$box).hide();

    this.$buttons.appendTo(this.$box);

    this.close(true);
  }

  open(focus) {
    this.$teaser.hide();
    this.$buttons.show();
    this.$replyBox.show();
    if (focus) {
      this.$replyBox.focus();
    }
    this.$box.addClass("touched");
  }

  close(clear) {
    this.$buttons.hide();
    this.$teaser.show();
    this.$replyBox.hide();
    if (clear) {
      this.$replyBox.val("");
      this.$content.text("");
      this.$box.removeClass("touched");
    } else {
      const val = this.$replyBox.val();
      if (val) {
        this.$content.text(this.$replyBox.val()).show();
      }
    }
  }

  getText() {
    return this.$replyBox.val();
  }

  getWidget() {
    return this.$box;
  }
}

async function formatComment(gerritUrl, $card, $msg, text, reviewData) {
  const pid = extractPatchSet(text);
  const revId = getRevisionIdByPatchNumber(reviewData, pid);

  const resp = await loadMessageComments(gerritUrl, $card, text, reviewData, revId);
  if (!resp.success) {
    console.log("Failed to load comments :'(");
    return;
  }

  formatMessageComments(gerritUrl, $msg, pid, revId, reviewData, resp.data);
}

function makeLineComment(comment, collapsed) {
  const $comment = $("<div class='gerrit-line-comment'/>");
  const lines = comment.message.split("\n");
  for (let k=0; k<lines.length; k++) {
    const line = lines[k];
    const $line = $("<div/>").appendTo($comment);
    if (k === 0) {
      $line.append($("<strong/>").text(comment.author.name + ": "));
    }
    $line.append($("<span/>").text(line + '\xA0'));
  }
  if (collapsed) {
    $("<a href='javascript:void 0;'/>").text("(expand)").addClass("gerrit-collapsed-toggle").appendTo($comment);
    $comment.addClass("gerrit-collapsed");
    $comment.click(function() {
      $comment.toggleClass("gerrit-collapsed");
    });
  }

  return $comment;
}

function makeCommentThread(lastComment, id2comment) {
  const $thread = $("<div/>");
  let $cur = makeLineComment(lastComment, false).appendTo($thread);
  let cur = lastComment;
  const parentComments = [];
  while (cur.in_reply_to && cur.in_reply_to in id2comment) {
    cur = id2comment[cur.in_reply_to];
    $cur = makeLineComment(cur, true).addClass("gerrit-parent-comment").insertBefore($cur);
    parentComments.push($cur[0]);
  }
  if (parentComments.length > 2) {
    const $hiddenComments = $(parentComments.slice(1, parentComments.length-1));
    $hiddenComments.hide();
    const $teaser = $("<div/>").addClass("gerrit-parent-comments-collapsed").insertBefore($(parentComments[0])).append($("<span/>").addClass("gerrit-strikethrough").text("\xA0\xA0\xA0\xA0\xA0\xA0\xA0\xA0\xA0\xA0")).append($("<span/>").text(parentComments.length - 2 + " more comments")).append($("<span/>").addClass("gerrit-strikethrough").text("\xA0\xA0\xA0\xA0\xA0\xA0\xA0\xA0\xA0\xA0"));
    $teaser.click(function() {
      $teaser.hide();
      $hiddenComments.show();
    });
  }
  return $thread;
}

function formatMessageComments(gerritUrl, $msg, pid, revId, reviewData, messageComments) {
  const lineReplyWidgets = [];
  let messageReplyWidget = null;

  async function collectAndSubmitComments(approve) {
    const review = {drafts: "PUBLISH_ALL_REVISIONS"};
    if (messageReplyWidget.getText().length > 0) {
      review.message = messageReplyWidget.getText();
    }
    if (approve) {
      review.labels = {'Code-Review': maxPermittedScore};
    }
    for (const lw of lineReplyWidgets) {
      if (lw.widget.getText().length > 0) {
        if (!("comments" in review)) {
          review.comments = {};
        }
        if (!(lw.file in review.comments)) {
          review.comments[lw.file] = [];
        }
        const newComment = {line: lw.line, message: lw.widget.getText(), in_reply_to: lw.parent};
        if (lw.parent_patch_set !== pid) {
          // Whee bit of hackery; right now if unresolved is null and the parent is from a different patch set than the revision we're
          // looking at, then Gerrit will throw up with "Invalid parentUuid supplied for comment".  So we force unresolved to true :-/
          newComment.unresolved = true;
        }
        review.comments[lw.file].push(newComment);
      }
    }
    const resp = await submitComments(gerritUrl, reviewData._number, revId, review);
    tracker.sendEvent("comment", "submit_comments");
    if (resp.success) {
      for (const lw of lineReplyWidgets) {
        lw.widget.close(true);
      }
      messageReplyWidget.close(true);
    }
    performActionCallback(gerritUrl, reviewData._number, resp);
  }

  $msg.empty();
  const $commentsBox = $("<div/>");
  $msg.append($commentsBox);
  const respondButtons = [
    makeButton("Submit Comments", {primary: true}).click(function() { collectAndSubmitComments(false); })
  ];
  const maxPermittedScore = maxPermittedCodeReviewScore(reviewData);
  if (maxPermittedScore > 0) {
    respondButtons.push(
      makeButton(
        "Submit Comments & Approve" + (maxPermittedScore != 2 ? ` (+${maxPermittedScore})` : "")
      ).click(function() { collectAndSubmitComments(true); }))
  }
  messageReplyWidget = new RespondWidget(
    makeButton("Reply").click(() => tracker.sendEvent("comment", "add_comment", "patchset")), 
    respondButtons);
  messageReplyWidget.getWidget().addClass("primary").appendTo($msg);

  const id2comment = {};
  for (const file in messageComments.allComments) {
    const fileComments = messageComments.allComments[file];
    for (const fc of fileComments) {
      id2comment[fc.id] = fc;
    }
  }

  const $header = $("<div/>").appendTo($commentsBox);
  for (let i=0; i<messageComments.message.length; i++) {
    const ptext = messageComments.message[i];
    const $line = $("<p/>").html(linkifyStr(ptext));
    if (i === 0) {
      $line.addClass("gerrit-header");
    }
    if (ptext.indexOf(`Code-Review+${maxCodeReviewScore(reviewData)}`) >= 0) {
      $header.addClass("gerrit-highlight-box");
      $line.addClass("green");
    } else if (ptext.indexOf("Verified+1") >= 0) {
      $header.addClass("gerrit-highlight-box");
      $line.addClass("green");
    } else {
      $header.addClass("gerrit-content-box");
    }
    $header.append($line);
  }

  for (const fileComment of messageComments.fileComments) {
    if (fileComment.lineComments.length === 0) {
      continue;
    }
    const $filebox = $("<div class='gerrit-content-box'/>").appendTo($commentsBox);
    $filebox.append($("<div class='gerrit-file-title'/>").text(fileComment.file));
    for (const lc of fileComment.lineComments) {
      const comment = id2comment[lc.id];
      $("<br/>").appendTo($filebox);
      $("<pre class='gerrit-line'/>")
        .text(
          (comment.patch_set !== pid ? `PS ${comment.patch_set}, ` : "") + 
          (comment.line === undefined ? 'File Comment' : `Line ${comment.line}: ${lc.lineContent}`)
        )
        .addClass(comment.side === "PARENT" ? "gerrit-old-line" : "gerrit-new-line")
        .appendTo($filebox);

      makeCommentThread(comment, id2comment).appendTo($filebox);

      const lineReplyWidget = new RespondWidget(
        makeButton("Reply", {small: true}).click(() => tracker.sendEvent("comment", "add_comment", "line")), []);
      lineReplyWidget.getWidget().appendTo($filebox);
      lineReplyWidget.$teaser.click(function() { messageReplyWidget.open(false); });
      lineReplyWidgets.push({widget: lineReplyWidget, file: fileComment.file, line: comment.line, parent: comment.id, parent_patch_set: comment.patch_set});
    }
  }
}

function _diffToContentLines(diff) {
  const content = [];
  for (const section of diff.content) {
    const lines = section.ab || section.b || [];
    for (const line of lines) {
      content.push(line);
    }
  }
  return content;
}

async function loadAllFileContentLinesDict(gerritUrl, reviewData, fileRevIds) {
  // fileRevIds is a list of two-element arrays of file and revId, like [[file1, rev1], [file2, rev1]], etc.
  // Returns a dict keyed by string `${file}___${rev}`, and the value is array of lines of that file
  // at that rev.
  const promises = fileRevIds.map(([file, revId]) => loadFileContentLines(gerritUrl, reviewData, file, revId));
  const resps = await Promise.all(promises);
  const dict = {};
  for (const [[file, revId], resp] of _.zip(fileRevIds, resps)) {
    if (resp.success) {
      dict[`${file}___${revId}`] = resp.data;
    }
  }
  return dict;
}

async function loadFileContentLines(gerritUrl, reviewData, file, revId) {
  // Try to serve file content from the diff cache if possible.
  if (reviewData.revisions[revId] && reviewData.revisions[revId].diffs && reviewData.revisions[revId].diffs[file]) {
    const diffs = reviewData.revisions[revId].diffs[file];
    // We don't care which base the diff was against; we're just going to turn the diff
    // content into file content.
    for (const key in diffs) {
      // Ignore the promise keys, created by loadAndCache().
      if (!key.startsWith("__promise_")) {
        return {success: true, data: _diffToContentLines(diffs[key])};
      }
    }
  }
  // Nothing found in the cache, so load it (against undefined baseId, because we don't care
  // which base we use)
  const resp = await loadAndCacheDiff(gerritUrl, reviewData, revId, file);
  if (!resp.success) {
    return resp;
  } else {
    return {success: true, data: _diffToContentLines(resp.data)};
  }
}

/**
 * Loads and returns the comments and messages that most closely match to the email 
 * held by $card.
 */
async function loadMessageComments(gerritUrl, $card, text, reviewData, revId) {
  // It is hard to use the REST API and figure out which comments belong to
  // this email message, since the comments we get from the REST API are just
  // grouped together under a file, and we can't tell which belong to which
  // email message.  Here we have two possible heuristics -- one by looking
  // at the actual email content, and matching it with the ones we get
  // from the REST API to attach IDs to those comments.  This doesn't work very well,
  // because since the Gerrit admin has control over the email templates,
  // we don't really know what the email content will look like. It's even more
  // challenging if we're dealing with HTML emails from 2.14+.
  // Another is to try to match this email message to one of the reviewData.messages, 
  // which is also just a best-guess effort, and then to keep all comments created
  // with the same timestamp as the reviewData.message.  This is also not guaranteed
  // to work; we are basically using the timestamp as the join key, and we can only 
  // hope that no two people have made a comment at the same time.  This is at
  // least more likely to work, though.
  const instance = getGerritInstance(gerritUrl);
  const baseId = guessNewPatchBase(instance, reviewData.revisions[revId]._number, reviewData);

  const resp = await loadAndCacheComments(gerritUrl, reviewData);
  if (!resp.success) {
    return resp;
  }
  const allComments = resp.data;
  const gMsg = guessGerritMessage($card, text, revId, reviewData, allComments);
  console.log("MATCHED", gMsg);
  if (!gMsg) {
    console.log("Failed to match " + revId, {text, reviewData, allComments});
    return {success: false};
  }

  // Filter down from allComments to only those comments that are linked to the
  // guessed Gerrit message.
  const messageComments = (
    _.chain(allComments)
    .pairs()
    // Filter to comments made by the same gMsg author, and with the same timestamp.
    .map(([file, comments]) => 
      [file, comments.filter(c => c.author.email === gMsg.author.email && c.updated === gMsg.date)])
    // Remove files whose comments all got filtered out
    .filter(([file, comments]) => comments.length > 0)
    // Rebuild into a dict keyed by files
    .object()
    .value());

  // Now we want to generate the list of (file, revision) pairs for all the file content
  // referenced by the messageComments.
  const requiredFileContents = (
    _.chain(messageComments)
    .pairs()
    // Map each (file, comments) to a list of (file, referenced revision ID)
    .map(([file, comments]) => comments.filter(fc => fc.line !== undefined).map(fc => [file, getRevisionIdByPatchNumber(reviewData, fc.patch_set)]))
    // Flatten so we just have one big list of (file, revision ID)
    .flatten(true)
    // Many comments refer to the same (file, revision ID), so we dedupe by converting
    // the (file, revisionID) tuple to string.
    .map(([file, revId]) => `${file}___${revId}`)
    .uniq()
    // Convert back to (file, revision ID)
    .map(fileRevId => fileRevId.split("___"))
    .value()
  );

  const fileRevIdToContentLines = await loadAllFileContentLinesDict(gerritUrl, reviewData, requiredFileContents);

  function buildFileComments(file) {
    const lineComments = [];
    for (const fc of messageComments[file]) {
      const fcRevId = getRevisionIdByPatchNumber(reviewData, fc.patch_set);
      const isSamePatchSet = fcRevId === revId;
      const fileLines = fileRevIdToContentLines[`${file}___${fcRevId}`];
      const lineContent = (fc.side === "PARENT" || !fileLines) ? "(unavailable...)" : fc.line === undefined ? undefined : fileLines[fc.line-1];
      lineComments.push({id: fc.id, line: fc.line, lineContent: lineContent, comments: fc.message.split("\n"), side: fc.side, patchNumber: fc.patch_set});
    }
    return {file, lineComments};
  }

  return {
    success: true,
    data: {
      message: gMsg.message.split("\n"), 
      fileComments: _.keys(messageComments).map(file => buildFileComments(file)), 
      allComments: allComments
    }
  };
}

function crunch(string) {
  return $.trim(string.replace(/\s+/g, " "));
}

const RE_COMMENT_DATE = /Gerrit-Comment-Date: ([^+\n]+ \+\d\d\d\d)/;
function extractGerritCommentDate(text) {
  const result = RE_COMMENT_DATE.exec(text);
  return result ? parseGerritDateString(result[1]) : null;
}

function parseGerritDateString(str) {
  return new Date(Date.parse(str));
}

function guessGerritMessage($card, text, revId, reviewData, allComments) {
  // TODO: this tries to match a Gmail $card with a reviewData.messages.
  // Very fragile!  Surely there's a better way???
  const pid = reviewData.revisions[revId]._number;
  const cardDate = extractGerritCommentDate(text).toString();
  console.log("Guessing for", {text: text, reviewData: reviewData});

  const textCrunched = crunch(text);
  for (let i = reviewData.messages.length-1; i >= 0; i--) {
    const msg = reviewData.messages[i];
    if (!msg.author) {
      // Gerrit-generated messages (like merge failed) do not have an author
      continue;
    }
    if (msg._revision_number !== pid) {
      continue;
    }
    /* Matching by author is hard to get right.  The FROM name displayed in
       Gerrit email may be totally different from the Gerrit user's name, email
       address, or username.  Skipping this guard :-/
    const cardFrom = $("span.gD", $card).text();
    if (!(cardFrom.indexOf(msg.author.name) >= 0 || 
          cardFrom.indexOf(msg.author.email) >= 0 ||
          cardFrom.indexOf((msg.author.email || "").split("@")[0]) >= 0 ||
          cardFrom.indexOf(msg.author.username) >= 0)) {
      console.log("Failed to match by author", {cardFrom: cardFrom, msg: msg});
      continue;
    }
    */
    if (cardDate !== new Date(Date.parse(msg.date + "+0000")).toString()) {
      // console.log("Failed to match by date", {cardDate: cardDate, msg: msg});      
      continue;
    }
    /* This check doesn't work for HTML-formatted emails
    if (textCrunched.indexOf(crunch(msg.message)) < 0) {
      continue;
    } 
    */   
    if (allComments && !matchFileComments(msg)) {
      // console.log("Failed to match file comments!", {allComments: allComments, msg: msg});
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
    for (const file in allComments) {
      const comments = allComments[file];
      for (const comment of comments) {
        if (comment.author.email === msg.author.email &&
            comment.updated === msg.date &&
            /* This doesn't work well for html-formatted emails
            textCrunched.indexOf(crunch(comment.message)) < 0 &&
            */
            file !== "/COMMIT_MSG" &&
            textCrunched.indexOf(file) < 0
           ) {
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
  const lines = text.split('\n');
  const $ul = $("<ul/>").appendTo($msg);
  for (const line of lines) {
    if (line.indexOf("*") === 0) {
      $("<li/>").text($.trim(line.substring(1))).appendTo($ul);
    }
  }
}


const RE_PATCHSET = /Gerrit-PatchSet: (\d+)/;
function extractPatchSet(text) {
  return parseInt(RE_PATCHSET.exec(text)[1]);
}

function formatNewPatch(gerritUrl, $card, $msg, text, reviewData) {
  const pid = extractPatchSet(text);
  const basePid = guessNewPatchBase(getGerritInstance(gerritUrl), pid, reviewData);

  $msg.empty().html("<h3>New Patch Set: " + pid + (basePid ? " (vs " + basePid + ")" : "") + "</h3>");
  
  const revId = getRevisionIdByPatchNumber(reviewData, pid);
  $msg.append(renderRevisionDiff(gerritUrl, reviewData, revId, basePid));
}

function guessNewPatchBase(instance, pid, reviewData) {
  // Guess the best "base" to diff against.  It's going to be the last one that was
  // commented upon by someone other than the author.
  for (let i = reviewData.messages.length - 1; i >= 0; i--) {
    const msg = reviewData.messages[i];
    if (!msg.author || (msg.tag && msg.tag.startsWith("autogenerated"))) {
      // Messages sent by Gerrit have no author, or comes with an autogenerated tag.
      continue;
    }
    if (msg._revision_number < pid && msg.author.username !== reviewData.owner.username && !isBot(msg.author.username, instance)) {
      return msg._revision_number;
    }
  }
  return undefined;
}

function getLabelStatus(reviewData, label) {
  if (!reviewData.labels || !reviewData.labels[label]) {
    return 0;
  }
  const reviewObj = reviewData.labels[label];
  if (!reviewObj.all || reviewObj.all.length === 0) {
    return 0;
  }
  const reviews = (reviewObj.all || 0).filter(rev => rev.value !== undefined);
  let maxPoints = 0;
  let minPoints = 0;
  for (let i=0; i < reviews.length; i++) {
    maxPoints = Math.max(maxPoints, reviews[i].value);
    minPoints = Math.min(minPoints, reviews[i].value);
  }
  if (minPoints < 0) {
    return minPoints;
  } else {
    return maxPoints;
  }
}

function isChangeOwner(change, selfEmail) {
  return selfEmail === change.owner.email;
}

function isChangeReviewer(change, selfEmail) {
  if (!change.reviewers || !change.reviewers.REVIEWER) {
    return false;
  }
  for (const reviewer of change.reviewers.REVIEWER) {
    if (selfEmail === reviewer.email) {
      return true;
    }
  }
  return false;
}

function reviewStatus(instance, reviewData) {
  const isOwner = isChangeOwner(reviewData, instance.email);
  const isReviewer = isChangeReviewer(reviewData, instance.email);
  if (reviewData.status === 'MERGED') {
    return 'Merged';
  } else if (reviewData.status === 'ABANDONED') {
    return 'Abandoned';
  } else if (reviewData.status === 'SUBMITTED') {
    return 'Merge Pending';
  } 

  if (reviewData.labels["Verified"]) {
    const verified = getLabelStatus(reviewData, 'Verified');
    if (verified < 0) {
      return "Failed Verify";
    } else if (verified === 0 && reviewData.labels.Verified && !reviewData.labels.Verified.optional) {
      return "Unverified";
    }
  }

  const maxCRScore = maxCodeReviewScore(reviewData);
  const approved = getLabelStatus(reviewData, 'Code-Review');
  if (approved === maxCRScore && undefinedOrTrue(reviewData.mergeable)) {
    return 'Approved';
  } else if (approved === maxCRScore) {
    return 'Cannot Merge';
  } else if (approved < 0) {
    return "Rejected";
  }
  
  if (isOwner) {
    for (let i=reviewData.messages.length-1; i>=0; i--) {
      const message = reviewData.messages[i];
      if (message.message.indexOf("rebased") >= 0 || isBot(message.author.username, instance)) {
        continue;
      } else if (message.author.email === selfEmail) {
        return "Waiting";
      } else {
        return "To Respond";
      }
    }
    return "Waiting";
  } else if (isReviewer) {
    for (let i=reviewData.messages.length-1; i>=0; i--) {
      const message = reviewData.messages[i];
      if (message.message.indexOf("rebased") >= 0 || isBot(message.author.username, instance)) {
        continue;
      } else if (message.author.email === selfEmail) {
        return "Reviewed";
      } else if (message.author.email === reviewData.owner.email) {
        return "To Review";
      }
    }
    return "To Review";
  } else if (reviewData.reviewed) {
    return "In Review";
  } else {
    return "New";
  }
}

function clearDiff() {
  changeGerritUrl = null;
  changeId = null;
  $sideBox.detach();
}

function canSubmit(reviewData) {
  return (
    undefinedOrTrue(reviewData.mergeable) &&
    undefinedOrTrue(reviewData.submittable) &&
    reviewData.revisions[reviewData.current_revision].actions.submit !== undefined
  );
}

function hidePageAction() {
  sendMessage({type: "hidePageAction"});
}

function showNeedSetup() {
  tracker.sendAppView("need_setup");
  sendMessage({type: "showSetup"});
  tracker.set("dimension2", "unconfigured");
}

function showNeedLogin() {
  tracker.sendAppView("need_login");
  sendMessage({type: "showLogin"});
  tracker.set("dimension2", "unauthenticated");
}

function showSuccess() {
  sendMessage({type: "showSuccess"});
  tracker.set("dimension2", "connected");
}

async function loadSettings() {
  return await sendMessage({type: "settings"});
}

function getGerritInstance(gerritUrl) {
  return _.find(gSettings.gerritInstances, inst => inst.url == gerritUrl);
}

async function authenticate(url) {
  const instance = getGerritInstance(url);
  console.log("Authenticating for", instance);
  const resp = await sendMessage({type: "authenticate", url});
  if (resp.success) {
    instance.auth = true;
    instance.email = resp.email;
    showSuccess();
  } else {
    instance.auth = false;
    instance.email = undefined;
    showNeedLogin();
  }
  return resp;
}

function viewDiff(url, id) {
  sendMessage({type: "viewDiff", url, id});  
}

async function commentDiff(url, id, score, comment) {
  let commentText = null;
  if (comment) {
    commentText = prompt("Say your piece.");
    if (!commentText) {
      return;
    }
  }
  return await authenticatedSend({type: "commentDiff", url, id, score, comment: commentText});
}

async function approveSubmitDiff(url, id, score) {
  const resp = await commentDiff(url, id, score, false);
  if (!resp.success) {
    return resp;
  } else {
    return await submitDiff(url, id);
  }
}

async function submitDiff(url, id) {
  const resp = await authenticatedSend({type: "submitDiff", url, id});
  if (!resp.success && resp.status === 409 && resp.err_msg.indexOf("Please rebase") >= 0) {
    console.log("Submit failed; automatically rebasing...");
    return await rebaseSubmitChange(url, id);
  } else {
    return resp;
  }
}

async function rebaseChange(url, id) {
  return await authenticatedSend({type: "rebaseChange", url, id});
}

async function submitComments(url, id, revId, review) {
  return await authenticatedSend({type: "submitComments", url, id, revId, review});
}

async function rebaseSubmitChange(url, id) {
  const resp = await rebaseChange(url, id);
  if (!resp.success) {
    return resp;
  } else {
    return await authenticatedSend({type: "submitDiff", url, id});
  }
}

async function initialize() {
  const service = analytics.getService("gmail_gerrit_extension");
  tracker = service.getTracker("UA-114677209-1");
  tracker.set("dimension1", getGmailType());

  const settings = await loadSettings();
  const validInstances = (settings.gerritInstances || []).filter(inst => inst.url);

  if (validInstances.length == 0) {
    // No URLs set; forget it
    showNeedSetup();
    console.log("Gerrit extension still needs to be setup; nevermind.")
    return;
  }

  const usableInstances = validInstances.filter(inst => !inst.gmail || window.document.title.indexOf(inst.gmail) >= 0);
  if (usableInstances.length == 0) {
    // Email is set and is not the current gmail account; forget it
    console.log("Gerrit extension expecting gmail in title " + window.document.title + " but not found; nevermind!");
    tracker.sendAppView("wrong_gmail");
    return;
  }

  console.log("Running Gerrit plugin!");

  gSettings.gerritInstances = usableInstances;
  gSettings.contextLines = settings.contextLines;
  
  console.log("Gerrit: settings", gSettings);

  tracker.sendAppView("initial");

  setTimeout(() => $("body").keypress(handleKeyPress), 3000);
  dom.onDomChanged(checkDiff, checkThreads, clearDiff);
}

function extractDiffIdFromUrl(url) {
  const m = re_rgid.exec(url);
  if (m && m.length >= 2) {
    return m[1];
  }
  return null;
}

function extractDiffId(gerritUrl) {
  const $thread = dom.getThread();
  const prevUrl = $thread.data("gerritUrl");
  const prevId = $thread.data("gerritDiffId");
  if (prevUrl && prevId) {
    return prevId;
  }
  // Use the schemeless version of the gerritUrl, so that for some gerrit.com url, we
  // would match both http://gerrit.com and https://gerrit.com.  That's just to work around
  // misconfiguration on Gerrit side, in case the link embedded in emails is http even
  // though Gerrit itself is hosted on https.
  const schemeless = extractSchemelessUrl(gerritUrl);
  const $anchor = $(`a[href*='${gerritUrl}']`, $thread);
  for (let i = 0; i < $anchor.length; i++) {
    const url = $($anchor[i]).attr("href");
    const id = extractDiffIdFromUrl(url);
    if (id) {
      $thread.data("gerritUrl", gerritUrl);
      $thread.data("gerritDiffId", id);
      return id;
    }
  }
  return null;
}

function extractSchemelessUrl(url) {
  const index = url.indexOf("://");
  if (index >= 0) {
    return url.substring(index);
  } else {
    return url;
  }
}

async function checkThreads() {
  const $subjects = dom.getSubjects()
    .filter(function() {return !$(this).data("gerrit-thread-seen");});
  if ($subjects.length === 0) {
    return;
  }

  const allInstanceChanges = await loadChangesForAllInstances();
  annotateThreads($subjects, allInstanceChanges);
}

async function loadChangesForAllInstances() {
  const allInstanceChanges = [];
  const promises = gSettings.gerritInstances.map(inst => loadChanges(inst.url));
  const allResults = await Promise.all(promises);
  for ([inst, instResults] of _.zip(gSettings.gerritInstances, allResults)) {
    if (instResults.success) {
      for (const change of instResults.data) {
        allInstanceChanges.push([inst, change]);
      }
    }
  }
  return allInstanceChanges;
}

function annotateThreads($subjects, allInstanceChanges) {
  function changeSubject(change) {
    return change.project + "[" + change.branch + "]: " + change.subject;
  }
  function findChange(text) {
    for (const [inst, change] of allInstanceChanges) {
      const subject = changeSubject(change).substring(0, 50);
      if (text.indexOf(subject) >= 0) {
        return [inst, change];
      }
    }
    return null;
  }
  for (let i=0; i<$subjects.length; i++) {
    const $subject = $($subjects[i]);
    if ($subject.data("gerrit-thread-seen") && !$subject.data("gerrit-thread-annotated")) {
      //console.log("Skipping seen but not gerrit: ", $subject.text());
      continue;
    }
    $subject.data("gerrit-thread-seen", true);
    const text = $subject.text();
    const found = findChange(text);
    if (found) {
      $subject.data("gerrit-thread-annotated", true);
      annotateSubject(found[0], $subject, found[1]);      
    }
  }
}

function annotateSubject(instance, $subject, change) {
  const status = reviewStatus(instance, change);
  const $button = dom.annotateSubject($subject, status, change.topic).click(() => viewDiff(instance.url, change._number));

  const isOwner = isChangeOwner(change, instance.email);

  if (["Merged", "Abandoned", "Merge Pending", "Reviewed", "Waiting", "Unverified"].indexOf(status) >= 0) {
    $button.addClass("gerrit-threadlist-button--muted");
  } 
  if (["Approved"].indexOf(status) >= 0) {
    $button.addClass("gerrit-threadlist-button--success");
    if (!isOwner) {
      $button.addClass("gerrit-threadlist-button--muted");
    }      
  } 
  if (["Failed Verify", "Rejected", "Cannot Merge"].indexOf(status) >= 0) {
    $button.addClass("gerrit-threadlist-button--danger");
    if (!isOwner) {
      $button.addClass("gerrit-threadlist-button--muted");
    }
  } 
  if (["To Review", "To Respond"].indexOf(status) >= 0) {
    $button.addClass("gerrit-threadlist-button--action");
  }
  tracker.sendEvent("render", "annotate", "subject");
}

async function checkDiff() {
  for (const inst of gSettings.gerritInstances) {
    const id = extractDiffId(inst.url);
    if (id !== changeId) {
      console.log(`Gerrit: Found change for ${inst.url} -- ${id}`);
      clearDiff();
      if (id) {
        await renderChange(inst.url, id);
      }
    }
  }
}

function isBot(username, instance) {
  return _.contains(instance.botNames || [], username);
}

async function handleKeyPress(e) {
  const $target = $(e.target);
  if ($target.hasClass("editable") || $target.prop("tagName").toLowerCase() === "input" || $target.prop("tagName").toLowerCase() === "textarea") {
    return;
  }
  if (changeId) {
    if (e.which === 119) {
      viewDiff(changeGerritUrl, changeId);
      tracker.sendEvent("keyboard_shortcut", "press", "view_diff");
    } else if (e.which === 87) {
      const resp = await loadChange(changeId);
      if (resp.success) {
        const reviewData = resp.data;
        const maxPermittedScore = maxPermittedCodeReviewScore(reviewData);
        const resp = await commentDiff(changeGerritUrl, changeId, maxPermittedScore, false);
        performActionCallback(changeGerritUrl, changeId, resp);
        if (resp.success) {
          flashMessage("Approved!");
          tracker.sendEvent("keyboard_shortcut", "press", "approve_diff");
        }
      }
    }
  }
}

async function waitUntil(condition, delay, maxAttempts) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    let timer = setInterval(
      () => {
        attempt += 1;
        if (condition()) {
          clearInterval(timer);
          resolve();
        } else if (attempt >= maxAttempts) {
          clearInterval(timer);
          reject();
        }
      }, delay);
  });
}

function getGmailType() {
  const href = window.location.href;
  if (href.startsWith('https://mail.google.com')) {
    return "gmail";
  } else if (href.startsWith("https://inbox.google.com")) {
    return "inbox";
  } else {
    return undefined;
  }
}

class GmailDom {
  ready() {
    return $("div[role=main]:first").length > 0;
  }
  isShowingThread() {
    return $("div[role='main'] table[role='presentation']").length > 0;
  }
  isShowingThreadList() {
    return $("div[role='main'] table.F.cf.zt").length > 0;
  }
  getThread() {
    return $("div[role='main'] .nH.if");
  }
  getCards($thread) {
    return $(".Bk", $thread);
  }
  getMessage($card) {
    return $($(".ii div", $card)[0]);
  }
  makeButton(primary, side) {
    const $button = $("<a class='gerrit-button gerrit-button--gmail T-I J-J5-Ji lR ar7 T-I-JO'/>");
    if (primary) {
      $button.addClass("gerrit-button--primary T-I-atl");
    } else {
      $button.addClass("T-I-ax7");
    }
    if (side == "left") {
      $button.addClass("T-I-Js-IF");
    } else if (side == "right") {
      $button.addClass("T-I-Js-Gs");
    }
    return $button;
  }
  onDomChanged(handleDiff, handleThreads, handleClearDiff) {
    let isShowingThreadList = false;

    const checkThreads = async () => {
      if (isShowingThreadList) {
        await handleThreads();
        setTimeout(checkThreads, 10000);
      }
    }

    const check = () => {
      if (this.isShowingThread()) {
        handleDiff();
      } else {
        handleClearDiff();
      }
      
      if (this.isShowingThreadList()) {
        tracker.sendAppView("threadlist");
        isShowingThreadList = true;
        checkThreads();
      } else {
        isShowingThreadList = false;
        if (!this.isShowingThread()) {
          console.log("Hmm, not showing threadlist or thread; try again in 5s");
          setTimeout(check, 5000);
        }
      }
    }
    $(window).bind("hashchange", () => setTimeout(check, 100));
    check();
  }
  flashMessage(message) {
    $(".b8 .vh").text(msg);
    $(".b8").css("top", "inherit");
  }
  sideBoxContainer() {
    // Show the actual sidebar, hidden by default
    $(".Bu.y3").css("width", 220);
    $(".nH.bno.adC").css("position", "static").css("width", "auto");    
    const $sidebar = $("div[role='main'] .nH.adC > .nH:first-child");
    const $container = $(".gerrit-sidebox-container--gmail", $sidebar);
    if ($container.length > 0) {
      return $container;
    }
    return $("<div class='gerrit-sidebox-container--gmail'/>").appendTo($sidebar);
  }
  getSubjects() {
    return $("div[role='main'] table.F.cf.zt td div[role='link'] div.y6 span:first-child");
  }
  
  annotateSubject($subject, status, topic) {
    let $button = $(".gerrit-threadlist-button", $subject.closest("td"));
    if ($button.length > 0) {
      return $button;
    } 
    const $parentLink = $subject.closest("div[role='link']");
    $parentLink.wrap("<div class='a4X' style='padding-right:30ex;'/>");
    const $panel = $("<span/>").addClass("aKS").insertAfter($parentLink);
    $button = $("<div/>").addClass("T-I J-J5-Ji aOd aS9 T-I-awv L3 gerrit-threadlist-button").prop("role", "button").appendTo($panel);
    $("<img/>").prop("src", chrome.extension.getURL("icons/gerrit.png")).addClass("gerrit-threadlist-icon").appendTo($button);
    $("<span/>").addClass("aJ6 gerrit-threadlist-span gerrit-threadlist-status").appendTo($button).text(status);
    $("<span/>").addClass("aJ6 gerrit-threadlist-span gerrit-threadlist-topic").appendTo($button).text(topic ? ` [${topic}]` : "");

    const $wrapper = $subject.closest(".a4X");
    $wrapper.css("padding-right", $button.outerWidth() + 10 + "px");

    return $button;
  }
  onThreadFormatted($thread) {
    // do nothing
  }
}

class InboxDom {
  ready() {
    return $("div[role=main]:first").length > 0;
  }
  isShowingThread() {
    return this.getThread().length > 0;
  }
  isShowingThreadList() {
    return true;
  }
  getThread() {
    // We get the item that's currently open, excluding the currently-opened bundle, and the item
    // that is open but is being closed (when you switch from opening one item to another item). 
    // In case we've selected more than one item this way for some reason,
    // we will also add a requirement for .scroll-list-item-highlighted, though I'm not sure
    // when an item is "highlighted" :-/
    const $opened = $(".scroll-list-item-open").not(".scroll-list-item-cluster").not(".scroll-list-item-measuring-close");
    if ($opened.length > 1) {
      return $opened.filter(".scroll-list-item-highlighted");
    } else {
      return $opened;
    }
  }
  getCards($thread) {
    return $(".ap.s2", $thread);
  }
  getMessage($card) {
    return $(".b5", $card);
  }
  makeButton(primary, side) {
    let $button;
    if (primary) {
      $button = $("<a class='gerrit-button gerrit-button--inbox sY dy Go qj gerrit-button--primary'/>");
    } else {
      $button = $("<a class='gerrit-button gerrit-button--inbox Jc H dH'/>");
    }
    if (side == "left") {
      $button.addClass("gerrit-button--left");
    } else if (side == "right") {
      $button.addClass("gerrit-button--right");
    }
    return $button;
  }
  onDomChanged(handleDiff, handleThreads, handleClearDiff) {
    const check = () => {
      if (this.isShowingThread()) {
        handleDiff();
      } else {
        handleClearDiff();
      }
      handleThreads();
    };
    const observer = new MutationObserver(_.debounce(check, 500));
    observer.observe($("#Nr")[0], {childList: true, subtree: true});
    check();
  }
  onThreadFormatted($thread) {
    // When Inbox is being too clever and quotes repeated Gerrit footers, we don't get to 
    // parse out important information.  Here, we show the quoted sections by clicking
    // on the show button.
    $(".mg", $thread).click();
  }
  flashMessage(message) {
    const $banner = $($("#Hg .sf")[0]);
    const $msg = $($("span", $banner)[1]);
    $msg.text(message).css("display", "inline");
    $banner.removeClass("l2").removeClass("lU").addClass("ov");
  }
  sideBoxContainer() {
    const $thread = this.getThread();
    const $header = $(".bH", $thread);
    const $container = $(".gerrit-sidebox-container--inbox", $header);
    if ($container.length > 0) {
      return $container;
    } else {
      return $("<div class='gerrit-sidebox-container--inbox'/>").appendTo($header);
    }
  }
  getSubjects() {
    return $(".scroll-list-item .bg span:first-child");
  }
  annotateSubject($subject, status, topic) {
    const $panel = $subject.closest(".No");
    let $button = $(".gerrit-threadlist-button", $panel);
    if ($button.length > 0) {
      return $button;
    } 
    $button = $("<div/>").addClass("gerrit-threadlist-button gerrit-threadlist-button--inbox").prop("role", "button").appendTo($panel);
    $("<img/>").prop("src", chrome.extension.getURL("icons/gerrit.png")).addClass("gerrit-threadlist-icon").appendTo($button);
    $("<span/>").addClass("aJ6 gerrit-threadlist-span gerrit-threadlist-status").appendTo($button).text(status);
    $("<span/>").addClass("aJ6 gerrit-threadlist-span gerrit-threadlist-topic").appendTo($button).text(topic ? ` [${topic}]` : "");

    return $button;    
  }
}

$(async () => {
  const gmailType = getGmailType();
  if (gmailType == "gmail") {
    console.log("Gerrit: Gmail mode");
    dom = new GmailDom();
  } else if (gmailType == "inbox") {
    console.log("Gerrit: Inbox mode");
    dom = new InboxDom();
  } else {
    console.log("Unknown Gmail type; quitting");
    return;
  }

  try {
    await waitUntil(dom.ready, 1000, 10);
    console.log("Gmail ready! Gerrit extension starting", window.document.title);
  } catch(err) {
    console.log("Failed to wait for Gmail to initialize within 10 seconds");
    return;
  }
  initialize();
});
