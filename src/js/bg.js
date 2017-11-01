function contentHandler(request, sender, callback) {
  console.log("REQUEST", request);
  if (request.type == "loadChange") {
    return loadChange(request.id, callback);
  } else if (request.type == "loadFiles") {
    return loadFiles(request.id, request.revId, callback);
  } else if (request.type == "loadChanges") {
    return loadChanges(callback);
  } else if (request.type == "loadDiff") {
    return loadDiff(request.id, request.revId, request.file, request.baseId, callback);
  } else if (request.type == "loadComments") {
    return loadComments(request.id, request.revId, callback);
  } else if (request.type == "loadFileContent") {
    return loadFileContent(request.id, request.revId, request.file, callback);
  } else if (request.type == "viewDiff") {
    return showDiffs(request.id);
  } else if (request.type == "commentDiff") {
    return commentDiff(request.id, request.approve, request.comment, callback);
  } else if (request.type == "submitDiff") {
    return submitDiff(request.id, callback);
  } else if (request.type == "rebaseChange") {
    return rebaseChange(request.id, callback);
  } else if (request.type == "submitComments") {
    return submitComments(request.id, request.revId, request.review, callback);
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

function commentDiff(id, approve, comment, callback) {
  // callback receives true for success, false for failure
  var url = '/changes/' + id + '/revisions/current/review';
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

function submitDiff(id, callback) {
  // callback receives true for success, false for failure
  var url = '/changes/' + id + '/revisions/current/submit';
  ajax(url, callback, 'POST', {wait_for_merge: true});
  return true;
}

function rebaseChange(id, callback) {
  var url = '/changes/' + id + '/rebase';
  ajax(url, callback, 'POST');
  return true;
}

function submitComments(id, revId, review, callback) {
  var url = '/changes/' + id + '/revisions/' + revId + '/review';
  ajax(url, callback, 'POST', review);
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

function initializeAuth() {
  return $.ajax(gerritUrl(), {timeout: 5000}).then(function (data) {
    console.log("INITIAL DATA", data);
    var auth = _extractRe(_RE_AUTH, data);
    if (auth) {
      var email = _extractRe(_RE_EMAIL, data);    
      _GERRIT_AUTH = auth;
      return {email: email};
    } else {
      console.log("Failed to extract XSRF token from html; attempting to read from cookie");
      var d = $.Deferred()
      wrapChromeCall(chrome.cookies.get, [{url: gerritUrl(), name: "XSRF_TOKEN"}]).then(function (resp) {
        if (!resp || !resp.value) {
          console.log("Failed to read XSRF_TOKEN from cookie :-/");
          d.reject();
        } else {
          _GERRIT_AUTH = resp.value;
          ajax("/accounts/self/detail", function(resp) {
            console.log("ACCOUNT DETAILS", resp);
            if (resp.success) {
              d.resolve({email: resp.data.email});
            } else {
              d.reject();
            }
          });
        }
      });
      return d.promise();
    }
  });
}

function loadChanges(callback) {
  var options = ['DETAILED_LABELS', 'MESSAGES', 'REVIEWED', 'DETAILED_ACCOUNTS'];
  //var query = "(is:reviewer OR is:owner) AND -age:7d";
  var query = "-age:7d";
  ajax("/changes/", callback, 'GET', {q: query, o: options}, {traditional: true});
  return true;
}

function loadChange(id, callback) {
  var options = ['LABELS', 'CURRENT_REVISION', 'ALL_REVISIONS', 'MESSAGES', 'CURRENT_ACTIONS', 'REVIEWED', 'ALL_COMMITS', 'DETAILED_LABELS', 'ALL_FILES'];
  ajax("/changes/" + id + "/detail", callback, 'GET', {o: options}, {traditional: true});
  return true;
}

function loadComments(id, revId, callback) {
  ajax("/changes/" + id + "/revisions/" + revId + "/comments/", callback);
  return true;
}

function loadDiff(changeId, revId, file, baseId, callback) {
  var options = {intraline: true, context: "ALL"};
  if (baseId) {
    options.base = baseId;
  }
  ajax("/changes/" + changeId + "/revisions/" + revId + "/files/" + encodeURIComponent(file) + "/diff", callback, 'GET', options);
  return true;
}

function loadFiles(changeId, revId, callback) {
  ajax("/changes/" + changeId + "/revisions/" + revId + "/files/", callback);
  return true;
}

function loadFileContent(changeId, revId, file, callback) {
  function fileCallback(resp) {
    if (!resp.success) {
      callback(resp);
    } else {
      resp.data = atob(resp.data);
      callback(resp);
    }
  }
  ajax("/changes/" + changeId + "/revisions/" + revId + "/files/" + encodeURIComponent(file) + "/content", fileCallback, undefined, undefined, undefined, "text");
  return true;
}

var _outstandingRequests = {};
function ajax(uri, callback, opt_type, opt_data, opt_opts, opt_dataType) {
  var dataType = opt_dataType || "json";
  var settings = {
    dataType: dataType,
    dataFilter: function(data) { return dataType == "json" ? data.substring(4) : data; },
    timeout: 60000
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
    if (xhr.status == 403) {
      console.log("403!  Try getting auth again");
      initializeAuth().done(function() {
        console.log("Re-issuing ajax call using new token...");
        ajax(uri, callback, opt_type, opt_data, opt_opts, opt_dataType);
      }).fail(function() {
        callback({success: false, err_msg: "Cannot authenticate"});
      });
    } else {
      err_msg = textStatus == "timeout" ? "Operation timed out" : xhr.responseText;
      callback({success: false, status: xhr.status, err_msg: err_msg});
    }
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

  var key = JSON.stringify([uri, settings.dataType, settings.data]);
  if (settings.type == "GET" && key in _outstandingRequests) {
    console.log("Collapsing calls", key);
    _outstandingRequests[key].done(onSuccess).fail(onError);
  } else {
    _outstandingRequests[key] = $.ajax(gerritUrl() + uri, settings)
      .done(onSuccess)
      .fail(onError)
      .always(function() { delete _outstandingRequests[key]; });
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

function showDiffs(id) {
  chrome.tabs.create({url:gerritUrl() + "/" + id});
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
  initializeAuth().done(function(result) {
    console.log("email: " + result.email + ", auth: " + _GERRIT_AUTH);
    callback({success: true, email: result.email});
  }).fail(function() {
    callback({success: false, err_msg: "Cannot authenticate"});
  });
  return true;
}

function loadSettings(callback) {
  var settings = {
    url: gerritUrl(), 
    gmail: gerritGmail(), 
    contextLines: localStorage['contextLines'] || 3, 
    user: user(), 
    hasPassword: password() != '',
    botNames: (localStorage['botNames'] || "jenkins").split(",").map(function(x) { return x.trim();})
  };
  callback(settings);
  return true;
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

function wrapChromeCall(func, args) {
  var deferred = $.Deferred();
  var callback = function (resp) {
    deferred.resolve(resp);
  };
  func.apply(null, args.concat([callback]));
  return deferred.promise();
}
