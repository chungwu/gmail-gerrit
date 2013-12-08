function contentHandler(request, sender, callback) {
  console.log("REQUEST", request);
  if (request.type == "loadChange") {
    return loadChange(request.rbId, callback);
  } else if (request.type == "loadFiles") {
    return loadFiles(request.rbId, request.revisionId, callback);
  } else if (request.type == "loadDiff") {
    return loadDiff(request.rbId, request.revisionId, request.file, request.baseId, callback);
  } else if (request.type == "loadComments") {
    return loadComments(request.rbId, request.revisionId, callback);
  } else if (request.type == "loadFileContent") {
    return loadFileContent(request.rbId, request.revisionId, request.file, callback);
  } else if (request.type == "viewDiff") {
    return showDiffs(request.rbId);
  } else if (request.type == "commentDiff") {
    return commentDiff(request.rbId, request.approve, request.comment, callback);
  } else if (request.type == "submitDiff") {
    return submitDiff(request.rbId, callback);
  } else if (request.type == "rebaseSubmitDiff") {
    return rebaseSubmitDiff(request.rbId, callback);
  } else if (request.type == "approveSubmitDiff") {
    return approveSubmitDiff(request.rbId, callback);
  } else if (request.type == "settings") {
    return loadSettings(callback);
  } else if (request.type == "authenticate") {
    return authenticate(callback);
  } else if (request.type == "showSetup") {
    return showPageActionError(sender.tab.id);
  } else if (request.type == "showLogin") {
    return showPageActionError(sender.tab.id);
  } else if (request.type == "hidePageAction") {
    return hidePageAction(sender.tab.id);
  }
}
chrome.runtime.onMessage.addListener(contentHandler);

function showPageActionError(tabId) {
  chrome.pageAction.show(tabId);
  chrome.pageAction.setIcon({tabId:tabId, path:"icons/gerrit-error.png"});
}

function hidePageAction(tabId) {
  chrome.pageAction.hide(tabId);
}

function commentDiff(rbId, approve, comment, callback) {
  // callback receives true for success, false for failure
  var url = '/changes/' + rbId + '/revisions/current/review';
  var request = {};
  if (approve) {
    request.labels = {"Code-Review": 2}
  }
  if (comment) {
    request.message = comment;
  }
  ajax(url, callback, 'POST', request);
  return true;
}

function submitDiff(rbId, callback) {
  // callback receives true for success, false for failure
  var url = '/changes/' + rbId + '/revisions/current/submit';
  ajax(url, callback, 'POST', {wait_for_merge: true});
  return true;
}

function approveSubmitDiff(rbId, callback) {
 commentDiff(rbId, true, false, function(resp) {
    if (resp.success) {
      // after approve, submit again
      submitDiff(rbId, callback);
    } else {
      callback(resp);
    }
  });
  return true;
}

_RE_AUTH = /xGerritAuth="([^"]+)"/
_RE_USER = /"userName":"([^"]+)"/
_RE_EMAIL = /"preferredEmail":"([^"]+)"/
_GERRIT_AUTH = undefined;

function _extractRe(re, text) {
  var match = re.exec(text);
  return match ? match[1] : undefined;
}

function initializeAuth(callback) {
  function onSuccess(data, textStatus, xhr) {
    _GERRIT_AUTH = _extractRe(_RE_AUTH, data);
    var user = _extractRe(_RE_USER, data);
    var email = _extractRe(_RE_EMAIL, data);
    console.log("User: " + user + ", email: " + email + ", auth: " + _GERRIT_AUTH);
    if (_GERRIT_AUTH && user && email) {
      callback({success: true, user: user, email: email});
    } else {
      callback({success: false, err_msg: "Cannot authenticate"});
    }
  }
  function onError(xhr, textStatus, errorThrown) {
    window.xhr = xhr;
    callback({success: false, err_msg: "Cannot authenticate"});
  }
  $.ajax(gerritUrl(), {success: onSuccess, error: onError, timeout: 1000});
}

function loadChange(rbId, callback) {
  var options = ['LABELS', 'CURRENT_REVISION', 'ALL_REVISIONS', 'MESSAGES', 'CURRENT_ACTIONS', 'REVIEWED', 'ALL_COMMITS', 'DETAILED_LABELS', 'ALL_FILES'];
  ajax("/changes/" + rbId + "/detail", callback, 'GET', {o: options}, {traditional: true});
  return true;
}

function loadComments(rbId, revId, callback) {
  ajax("/changes/" + rbId + "/revisions/" + revId + "/comments/", callback);
  return true;
}

function loadDiff(changeId, revisionId, file, baseId, callback) {
  var options = {intraline: true};
  if (baseId) {
    options.base = baseId;
  }
  ajax("/changes/" + changeId + "/revisions/" + revisionId + "/files/" + encodeURIComponent(file) + "/diff", callback, 'GET', options);
  return true;
}

function loadFiles(changeId, revisionId, callback) {
  ajax("/changes/" + changeId + "/revisions/" + revisionId + "/files/", callback);
  return true;
}

function loadFileContent(changeId, revisionId, file, callback) {
  function fileCallback(resp) {
    if (!resp.success) {
      callback(resp);
    } else {
      resp.data = atob(resp.data);
      callback(resp);
    }
  }
  ajax("/changes/" + changeId + "/revisions/" + revisionId + "/files/" + encodeURIComponent(file) + "/content", fileCallback, undefined, undefined, undefined, "text");
  return true;
}

function ajax(uri, callback, opt_type, opt_data, opt_opts, opt_dataType) {
  var dataType = opt_dataType || "json";
  var settings = {
    dataType: dataType,
    dataFilter: function(data) { return dataType == "json" ? data.substring(4) : data; },
    timeout: 3000
  };
  if (opt_opts) {
    $.extend(settings, opt_opts);
  }

  settings.type = opt_type || 'GET';
  settings.headers = settings.headers || {};
  settings.headers['X-Gerrit-Auth'] = _GERRIT_AUTH;

  if (opt_data) {
    if (settings.type == 'GET') {
      settings.data = opt_data;
    } else {
      settings.data = JSON.stringify(opt_data);
      settings.contentType = 'application/json';
    }
  }

  function onSuccess(data, textStatus, xhr) {
    callback({success: true, status: xhr.status, data: data});
  }

  // NORMAL error
  function onError(xhr, textStatus, errorThrown) {
    callback({success: false, status: xhr.status, err_msg: xhr.responseText});
  }

  // DIGEST error
  // var auth = {step: 0};
  // function onError(xhr, textStatus, errorThrown) {
  //   if (auth.step == 1 || xhr.status != 401) {
  //     console.log("real error!");
  //     callback({success: false, status: xhr.status, err_msg: xhr.responseText});
  //     return;
  //   }

  //   // status is 401
  //   console.log("Attempting digest auth...");
  //   auth.step = 1;
  //   var challenge = xhr.getResponseHeader('WWW-Authenticate');
  //   var response = _buildChallengeResponse(uri, settings.type, challenge);
  //   settings.headers = settings.headers || {}
  //   settings.headers['Authorization'] = response;
  //   $.ajax(gerritUrl() + "/a" + uri, settings);
  // }

  settings.success = onSuccess;
  settings.error = onError;
  $.ajax(gerritUrl() + "/a" + uri, settings);
}

var xhr;
_RE_NONCE = /nonce="([^"]+)"/
function _buildChallengeResponse(uri, method, challenge) {
  var auth = _parseChallenge(challenge);
  var cnonce = (Math.random()).toString();
  var nonce = _extractRe(_RE_NONCE.exec, challenge);
  var nc = "00000001";
  var A1 = digest(user() + ":" + auth.headers.realm + ":" + password());
  var A2 = digest(method + ":" + uri);
  var R = digest(
    A1 + ":" + 
    auth.headers.nonce + ":" + 
    nc + ":" +
    cnonce + ":" + 
    auth.headers.qop + ":" +
    A2);

  var buffer = [];
  buffer.push('username="' + user() + '"');
  buffer.push('realm="' + auth.headers.realm + '"');
  buffer.push('nonce="' + nonce + '"');
  buffer.push('uri="' + uri + '"');
  buffer.push('cnonce="' + cnonce + '"');
  buffer.push('nc="' + nc + '"');
  buffer.push('qop="' + auth.headers.qop + '"');
  buffer.push('response="' + R + '"');
  return auth.scheme + " " + buffer.join(", ");
}

function digest(str) {
  console.log("Digest: ", str);
  return CryptoJS.MD5(str);
}

function _parseChallenge(h) {
  var auth = {};

  var scre = /^\w+/;
  var scheme = scre.exec(h);
  auth.scheme = scheme[0];
  auth.headers = {};

  var nvre = /(\w+)=['"]([^'"]+)['"]/g;
  var pairs = h.match(nvre);

  var vre = /(\w+)=['"]([^'"]+)['"]/;
  var i = 0;
  for (; i<pairs.length; i++) {
    var v = vre.exec(pairs[i]);
    if (v) {
      auth.headers[v[1]] = v[2];
    }
  }
  return auth;
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

function showDiffs(rbId) {
  chrome.tabs.create({url:gerritUrl() + "/" + rbId});
}

function login() {
  chrome.tabs.create({url:gerritUrl()});
}

function setup() {
  chrome.tabs.create({url:"options.html"});
}

function gerritUrl() {
  return localStorage['host'];
}

function gerritGmail() {
  return localStorage['gmail'];
}

function user() {
  return localStorage['user'];
}

function password() {
  return localStorage['password'];
}

function authenticate(callback) {
  initializeAuth(callback);
  return true;
}

function loadSettings(callback) {
  callback({url: gerritUrl(), gmail: gerritGmail(), user: user(), hasPassword: password() != ''});
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