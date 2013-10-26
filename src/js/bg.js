chrome.extension.onRequest.addListener(contentHandler);

tabRbId = {}
tabRbStatus = {}

function contentHandler(request, sender, callback) {
  if (request.type == "loadRb") {
    reviewStatus(request.rbId, function(data) { callback(JSON.stringify(data)); });
  } else if (request.type == "showRbAction") {
    showRbAction(sender.tab.id, request.rbId, request.status);
  } else if (request.type == "hideRbAction") {
    hideRbAction(sender.tab.id);
  } else if (request.type == "viewDiff") {
    showDiffs(request.rbId);
  } else if (request.type == "approve") {
    approveRb(request.rbId, callback);
  } else if (request.type == "rbUrl") {
    callback(rbUrl());
  } else if (request.type == "showSetup") {
    chrome.pageAction.show(sender.tab.id);
    chrome.pageAction.setIcon({tabId:sender.tab.id, path:"icons/reviewboard-error.png"});
  }
}

function showRbAction(tabId, rbId, status) {
  tabRbId[tabId] = rbId;
  if (status == "unsetup" || status == "unauthorized") {
    chrome.pageAction.setIcon({tabId:tabId, path:"icons/reviewboard-error.png"});
  } else if (status == "approved") {
    chrome.pageAction.setIcon({tabId:tabId, path:"icons/reviewboard-approved.png"});      
  } else {
    chrome.pageAction.setIcon({tabId:tabId, path:"icons/reviewboard.png"});
  }
  chrome.pageAction.show(tabId);
}

function hideRbAction(tabId) {
  delete tabRbId[tabId];
  delete tabRbStatus[tabId];
  chrome.pageAction.hide(tabId);
}

function getRbId(callback) {
  chrome.tabs.getSelected(null, function(tab) {
    callback(tabRbId[tab.id]);
  });
}

function approveRb(rbId, callback) {
  // callback receives true for success, false for failure
  var url = rbUrl() + '/api/json/reviewrequests/' + rbId + '/reviews/draft/publish/';
  $.post(url, {shipit:1}, function(data) {
    if (data && data.stat == "ok") {
      callback(true);
    } else if (data.stat == "fail" && data.err.code == 103) {
      login(rbId);
    } else {
      console.log("GMRB: FAILED TO APPROVE", data);
      callback(false);
    }
  }, "json");
}

function reviewStatus(rbId, callback) {
  console.log("Fetching review status for", rbId);
  if (!rbUrl()) {
    callback({status: "unsetup"});
  }

  if (rbId in tabRbStatus) {
    var data = tabRbStatus[rbId];
    if (data.status != "unauthorized") {
      callback(tabRbStatus[rbId]);
      return;
    }
  }
  var onSuccess = function(data, textStatus, xhr) {
    console.log("SUCCESS!", data);
    tabRbStatus[rbId] = data;
    callback(data);
  };
  var onError = function(xhr, textStatus, errorThrown) {
    console.log("GMRB: ERROR STATUS", xhr.status);
    if (xhr.status == 401 || xhr.status == 405) {
      var result = {status: "unauthorized"};
      tabRbStatus[rbId] = result;
      callback(result);
    }
  };

  $.ajax(rbUrl() + "/a/changes/" + rbId + "/revisions/current/review", {
    username: user(),
    password: password(),
    dataType: "json",
    dataFilter: function(data) { return data.substring(4); },
    success: onSuccess,
    error: onError
  });
}

function _extractUserName($page) {
  return $("#ul.accountnav li:first-child b", $page).text();
}

function _extractReviewers($page) {
  var $blocks = $(".review .header", $page);
  var reviewers = [];
  for (var i=0; i<$blocks.length; i++) {
    var $block = $($blocks[i]);
    reviewers.push({
      name: $(".reviewer a", $block).text(),
      shipit: $(".shipit").length > 0
    })
  }
  return reviewers;
}

function showReview(rbId) {
  chrome.tabs.create({url:rbUrl() + "/r/" + rbId});
}

function showDiffs(rbId) {
  chrome.tabs.create({url:rbUrl() + "/" + rbId});
}

function login(rbId) {
  chrome.tabs.create({url:rbUrl() + "/account/login?next_page=" + rbUrl() + "/r/" + rbId});
}

function setup() {
  chrome.tabs.create({url:"options.html"});
}

function rbUrl() {
  return localStorage['host'];
}

function user() {
  return localStorage['user'];
}

function password() {
  return localStorage['password'];
}

function getPopup() {
  var url = chrome.extension.getURL("popup.html");
  var views = chrome.extension.getViews();
  for (var i=0; i<views.length; i++) {
    var view = views[i];
    if (view.location.href == url) {
      return view;
    }
  }
  return null;
}