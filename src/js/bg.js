function contentHandler(request, sender, callback) {
  console.log("REQUEST", request);
  if (request.type == "loadDiff") {
    return loadDiff(request.rbId, callback);
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
  function onSuccess(data, textStatus, xhr) {
    callback({success: true});
  }
  function onError(xhr, textStatus, errorThrown) {
    console.log("XHR", xhr);
    callback({success: false, err_msg: xhr.responseText});
  }
  var request = {};
  if (approve) {
    request.labels = {"Code-Review": 2}
  }
  if (comment) {
    request.message = comment;
  }
  ajax(url, onSuccess, onError, 'POST', request);
  return true;
}

function submitDiff(rbId, callback) {
  // callback receives true for success, false for failure
  var url = '/changes/' + rbId + '/revisions/current/submit';
  function onSuccess(data, textStatus, xhr) {
    callback({success: true});
  }
  function onError(xhr, textStatus, errorThrown) {
    console.log("XHR", xhr);
    callback({success: false, err_msg: xhr.responseText});
  }
  ajax(url, onSuccess, onError, 'POST', {wait_for_merge: true});
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

function rebaseSubmitDiff(rbId, callback) {
  loadDiff(rbId, function(resp) {
    if (!resp.success) { 
      callback(resp);
    } else {
      var data = resp.data;
      console.log("Loaded", data);
      console.log("Patch set", data.revisions[data.current_revision]._number);
      function onSuccess() {
        approveSubmitDiff(rbId, callback);
      }
      function onError() {
        callback({success: false, err_msg: xhr.responseText});
      }
      //ajax('/changes/' + rbId + '/rebase', onSuccess, onError, 'POST');
      var url = '/gerrit_ui/rpc/ChangeManageService';
      ajax(url, onSuccess, onError, 'POST', {
        jsonrpc: "2.0", method: "rebaseChange", 
        params: [{changeId:{id:data._number}, patchSetId:data.revisions[data.current_revision]._number}],
        id: 2, xsrfKey: _GERRIT_AUTH
      });
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

function loadDiff(rbId, callback) {
  console.log("Fetching review status for", rbId);

  var onSuccess = function(data, textStatus, xhr) {
    console.log("SUCCESS!", data);
    callback({success: true, data: data});
  };
  var onError = function(xhr, textStatus, errorThrown) {
    console.log("ERROR:", xhr);
    callback({success: false, err_msg: xhr.responseText});
  };

  //var options = ['LABELS', 'CURRENT_REVISION', 'ALL_REVISIONS', 'MESSAGES', 'CURRENT_ACTIONS', 'REVIEWED'];
  //ajax("/changes/" + rbId + "/detail", onSuccess, onError, 'GET', {o: options}, {traditional: true});
  ajax("/changes/" + rbId + "/revisions/current/review", onSuccess, onError);

  return true;
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
      _GERRIT_AUTH = undefined;
      if (auth.step == 1 || xhr.status != 401) {
        console.log("real error!");
        error(xhr, textStatus, errorThrown);
        return;
      }
  
      // status is 401
      console.log("Attempting digest auth...");
      auth.step = 1;
      var challenge = xhr.getResponseHeader('WWW-Authenticate');
      var response = _buildChallengeResponse(uri, settings.type, challenge);
      settings.headers = settings.headers || {}
      settings.headers['Authorization'] = response;
      $.ajax(gerritUrl() + uri, settings);
    }
  
    settings.success = onSuccess;
    settings.error = onError;
    $.ajax(gerritUrl() + uri, settings);
  }

  if (_GERRIT_AUTH) {
    _ajax();
  } else {
    initializeAuth(function(resp) {
      if (resp.success) {
        _ajax();
      } else {
        error({responseText: 'Cannot reach Gerrit'});
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
  callback({url: gerritUrl(), gmail: gerritGmail()});
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