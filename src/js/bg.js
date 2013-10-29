chrome.extension.onRequest.addListener(contentHandler);

function contentHandler(request, sender, callback) {
  if (request.type == "loadRb") {
    reviewStatus(request.rbId, function(data) { callback(data); });
  } else if (request.type == "viewDiff") {
    showDiffs(request.rbId);
  } else if (request.type == "approveDiff") {
    approveRb(request.rbId, callback);
  } else if (request.type == "mergeDiff") {
    mergeRb(request.rbId, callback);
  } else if (request.type == "settings") {
    loadSettings(callback);
  } else if (request.type == "showSetup") {
    chrome.pageAction.show(sender.tab.id);
    chrome.pageAction.setIcon({tabId:sender.tab.id, path:"icons/reviewboard-error.png"});
  } else if (request.type == "showLogin") {
    chrome.pageAction.show(sender.tab.id);
    chrome.pageAction.setIcon({tabId:sender.tab.id, path:"icons/reviewboard-error.png"});
  }
}

function showRbAction(tabId, rbId, status) {
  if (status == "unsetup" || status == "unauthorized") {
    chrome.pageAction.setIcon({tabId:tabId, path:"icons/reviewboard-error.png"});
  } else if (status == "approved") {
    chrome.pageAction.setIcon({tabId:tabId, path:"icons/reviewboard-approved.png"});      
  } else {
    chrome.pageAction.setIcon({tabId:tabId, path:"icons/reviewboard.png"});
  }
  chrome.pageAction.show(tabId);
}

function showRbError() {
  chrome.pageAction.setIcon({tabId:tabId, path:"icons/reviewboard-error.png"});
}

function hideRbAction(tabId) {
  chrome.pageAction.hide(tabId);
}

function approveRb(rbId, callback) {
  // callback receives true for success, false for failure
  var url = '/changes/' + rbId + '/revisions/current/review';
  function onSuccess(data, textStatus, xhr) {
    callback(true, textStatus);
  }
  function onError(xhr, textStatus, errorThrown) {
    console.log("XHR", xhr);
    callback(false, textStatus);
  }
  ajax(url, onSuccess, onError, 'POST', {
    labels: {"Code-Review": 2}
  });
}

function mergeRb(rbId, callback) {
  // callback receives true for success, false for failure
  var url = '/changes/' + rbId + '/revisions/current/submit';
  function onSuccess(data, textStatus, xhr) {
    callback(true, textStatus);
  }
  function onError(xhr, textStatus, errorThrown) {
    console.log("XHR", xhr);
    callback(false, textStatus);
  }
  ajax(url, onSuccess, onError, 'POST', {wait_for_merge: true});
}


_RE_AUTH = /xGerritAuth="([^"]+)"/
_RE_USER = /"userName":"([^"]+)"/
_RE_EMAIL = /"preferredEmail":"([^"]+)"/
_GERRIT_AUTH = undefined;
_GERRIT_USER = undefined;
_GERRIT_EMAIL = undefined;

function _extractRe(re, text) {
  var match = re.exec(text);
  return match ? match[1] : undefined;
}

function initializeAuth(callback) {
  function onSuccess(data, textStatus, xhr) {
    _GERRIT_AUTH = _extractRe(_RE_AUTH, data);
    _GERRIT_USER = _extractRe(_RE_USER, data);
    _GERRIT_EMAIL = _extractRe(_RE_EMAIL, data);
    console.log("User: " + _GERRIT_USER + ", email: " + _GERRIT_EMAIL + ", auth: " + _GERRIT_AUTH);
    callback(_GERRIT_AUTH && _GERRIT_USER && _GERRIT_EMAIL);
  }
  function onError(xhr, textStatus, errorThrown) {
    window.xhr = xhr;
    callback(false);
  }
  $.ajax(rbUrl(), {success: onSuccess, error: onError, timeout: 1000});
}

function reviewStatus(rbId, callback) {
  console.log("Fetching review status for", rbId);
  if (!rbUrl()) {
    callback({status: "unsetup"});
  }

  var onSuccess = function(data, textStatus, xhr) {
    console.log("SUCCESS!", data);
    callback(data);
  };
  var onError = function(xhr, textStatus, errorThrown) {
    console.log("ERROR:", xhr);
    if (xhr.status == 401 || xhr.status == 405) {
      var result = {status: "unauthorized"};
      callback(result);
    }
  };

  ajax("/changes/" + rbId + "/detail", onSuccess, onError);
}

function ajax(uri, success, error, opt_type, opt_data, opt_opts) {
  function _ajax() {
    var settings = {
      dataType: "json",
      dataFilter: function(data) { return data.substring(4); },
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
  
    var auth = {step: 0};
    function onSuccess(data, textStatus, xhr) {
      success(data, textStatus, xhr);
    }
    function onError(xhr, textStatus, errorThrown) {
      window.xhr = xhr;
      if (auth.step == 1 || xhr.status != 401) {
        console.log("real error!");
        error(xhr, textStatus, errorThrown);
      }
  
      // status is 401
      console.log("Attempting digest auth...");
      auth.step = 1;
      var challenge = xhr.getResponseHeader('WWW-Authenticate');
      var response = _buildChallengeResponse(uri, settings.type, challenge);
      settings.headers = settings.headers || {}
      settings.headers['Authorization'] = response;
      $.ajax(rbUrl() + uri, settings);
    }
  
    settings.success = onSuccess;
    settings.error = onError;
    $.ajax(rbUrl() + uri, settings);
  }

  if (_GERRIT_AUTH) {
    _ajax();
  } else {
    initializeAuth(function(success) {
      if (success) {
        _ajax();
      } else {
        error();
      }
    });
  }
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

function showReview(rbId) {
  chrome.tabs.create({url:rbUrl() + "/r/" + rbId});
}

function showDiffs(rbId) {
  chrome.tabs.create({url:rbUrl() + "/" + rbId});
}

function login() {
  chrome.tabs.create({url:rbUrl()});
}

function setup() {
  chrome.tabs.create({url:"options.html"});
}

function rbUrl() {
  return localStorage['host'];
}

function loadSettings(callback) {
  initializeAuth(function(success) {
    if (success) {
      callback({user: _GERRIT_USER, url: rbUrl(), auth: true, email: _GERRIT_EMAIL});
    } else {
      callback({url: rbUrl(), auth: false});
    }
  });
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