function contentHandler(request, sender, callback) {
  console.log("REQUEST", request);
  if (request.type == "loadChange") {
    return wrapAsyncHandler(loadChange(request.url, request.id), callback);
  } else if (request.type == "loadFiles") {
    return wrapAsyncHandler(loadFiles(request.url, request.id, request.revId), callback);
  } else if (request.type == "loadChanges") {
    return wrapAsyncHandler(loadChanges(request.url), callback);
  } else if (request.type == "loadDiff") {
    return wrapAsyncHandler(loadDiff(request.url, request.id, request.revId, request.file, request.baseId), callback);
  } else if (request.type == "loadComments") {
    return wrapAsyncHandler(loadComments(request.url, request.id, request.revId), callback);
  } else if (request.type == "loadFileContent") {
    return wrapAsyncHandler(loadFileContent(request.url, request.id, request.revId, request.file), callback);
  } else if (request.type == "viewDiff") {
    return showDiffs(request.url, request.id);
  } else if (request.type == "commentDiff") {
    return wrapAsyncHandler(commentDiff(request.url, request.id, request.score, request.comment), callback);
  } else if (request.type == "submitDiff") {
    return wrapAsyncHandler(submitDiff(request.url, request.id), callback);
  } else if (request.type == "rebaseChange") {
    return wrapAsyncHandler(rebaseChange(request.url, request.id), callback);
  } else if (request.type == "submitComments") {
    return wrapAsyncHandler(submitComments(request.url, request.id, request.revId, request.review), callback);
  } else if (request.type == "settings") {
    return loadSettings(callback);
  } else if (request.type == "authenticate") {
    return wrapAsyncHandler(authenticate(request.url), callback);
  } else if (request.type == "showSetup") {
    return showPageActionError(sender.tab.id);
  } else if (request.type == "showLogin") {
    return showPageActionError(sender.tab.id);
  } else if (request.type == "showSuccess") {
    return showPageActionSuccess(sender.tab.id);
  } else if (request.type == "hidePageAction") {
    return hidePageAction(sender.tab.id);
  }
}
chrome.runtime.onMessage.addListener(contentHandler);

function showPageActionError(tabId) {
  chrome.pageAction.show(tabId);
  chrome.pageAction.setIcon({tabId:tabId, path:"icons/gerrit-error.png"});
}

function showPageActionSuccess(tabId) {
  chrome.pageAction.show(tabId);
  chrome.pageAction.setIcon({tabId:tabId, path:"icons/gerrit.png"});
  localStorage['hasSuccessfullyConnected'] = true;
}

function hidePageAction(tabId) {
  chrome.pageAction.hide(tabId);
}

async function commentDiff(gerritUrl, id, score, comment) {
  const path = `/changes/${id}/revisions/current/review`;
  const request = {};
  if (score !== undefined) {
    request.labels = {"Code-Review": score}
  }
  if (comment) {
    request.message = comment;
  }
  return ajax(gerritUrl, path, 'POST', request);
}

async function submitDiff(gerritUrl, id) {
  const path = `/changes/${id}/revisions/current/submit`;
  return ajax(gerritUrl, path, 'POST', {wait_for_merge: true});
}

async function rebaseChange(gerritUrl, id) {
  const path = `/changes/${id}/rebase`;
  return ajax(gerritUrl, path, 'POST');
}

async function submitComments(gerritUrl, id, revId, review) {
  const path = `/changes/${id}/revisions/${revId}/review`;
  return ajax(gerritUrl, path, 'POST', review);
}

_RE_AUTH = /xGerritAuth="([^"]+)"/
_RE_USER = /"userName":"([^"]+)"/
_RE_EMAIL = /"preferredEmail":"([^"]+)"/
_GERRIT_AUTHS = {};

function _extractRe(re, text) {
  const match = re.exec(text);
  return match ? match[1] : undefined;
}

async function initializeAuth(url) {
  return new Promise((resolve) => {
    $.ajax(url, {timeout: 5000})
      .done(async (data) => {
        const auth = _extractRe(_RE_AUTH, data);
        if (auth) {
          const email = _extractRe(_RE_EMAIL, data);    
          _GERRIT_AUTHS[url] = auth;
          resolve({success: true, email: email});
        } else {
          console.log("Failed to extract XSRF token from html; attempting to read from cookie for", url);
          const resp = await wrapChromeCall(chrome.cookies.getAll, [{domain: new URL(url).hostname, name: "XSRF_TOKEN"}]);
          if (!resp || resp.length == 0 || !resp[0].value) {
            console.log("Failed to read XSRF_TOKEN from cookie :-/");
            _GERRIT_AUTHS[url] = undefined;
            resolve({success: false});
          } else {
            _GERRIT_AUTHS[url] = resp[0].value;
            console.log("Found XSRF token", _GERRIT_AUTHS[url]);
            const details = await ajax(url, "/accounts/self/detail");
            console.log("ACCOUNT DETAILS", details);
            if (details.success) {
              resolve({success: true, email: details.data.email});
            } else {
              resolve({success: false});
            }
          }
        }
      })
    .fail(async (xhr, textStatus, errorThrown) => {
      console.log("Failed to initializeAuth", xhr);
      resolve({success: false});
    });
  });
}

function wrapAsyncHandler(promise, callback) {
  (async () => {
    callback(await promise);
  })();
  return true;
}

function loadChanges(gerritUrl) {
  const inst = getGerritInstance(gerritUrl);
  console.log(`Loading changes for ${gerritUrl}`, inst);
  const options = ['DETAILED_LABELS', 'MESSAGES', 'REVIEWED', 'DETAILED_ACCOUNTS'];
  const query = inst['inboxQuery'];
  return ajax(gerritUrl, "/changes/", 'GET', {q: query, o: options}, {traditional: true});
}

async function loadChange(gerritUrl, id) {
  const options = [
    'ALL_COMMITS', 
    'ALL_FILES',
    'ALL_REVISIONS', 
    'DETAILED_LABELS', 
    'MESSAGES', 
    'REVIEWED', 
    'SUBMITTABLE',
    'CURRENT_ACTIONS',
    'CHANGE_ACTIONS',
  ];
  return ajax(gerritUrl, `/changes/${id}/detail`, 'GET', {o: options}, {traditional: true});
}

async function loadComments(gerritUrl, id, revId) {
  let url = `/changes/${id}`;
  if (revId) {
    url += `/revisions/${revId}`;
  }
  url += "/comments/";
  return ajax(gerritUrl, url);
}

async function loadDiff(gerritUrl, changeId, revId, file, baseId) {
  const options = {intraline: true, context: "ALL"};
  if (baseId) {
    options.base = baseId;
  }
  return ajax(gerritUrl, `/changes/${changeId}/revisions/${revId}/files/${encodeURIComponent(file)}/diff`, 'GET', options);
}

async function loadFiles(gerritUrl, changeId, revId) {
  return ajax(gerritUrl, `/changes/${changeId}/revisions/${revId}/files/`);
}

async function loadFileContent(gerritUrl, changeId, revId, file) {
  const resp = await ajax(
    gerritUrl, 
    `/changes/${changeId}/revisions/${revId}/files/${encodeURIComponent(file)}/content`, 
    undefined, undefined, undefined, "text");
  if (!resp.success) {
    return resp;
  } else {
    resp.data = atob(resp.data);
    return resp;
  }
}

const _outstandingRequests = {};
async function ajax(gerritUrl, path, opt_type, opt_data, opt_opts, opt_dataType) {
  const dataType = opt_dataType || "json";
  const settings = {
    dataType: dataType,
    dataFilter: function(data) { return dataType == "json" ? data.substring(4) : data; },
    timeout: 60000
  };
  if (opt_opts) {
    $.extend(settings, opt_opts);
  }

  settings.type = opt_type || 'GET';
  settings.headers = settings.headers || {};
  settings.headers['X-Gerrit-Auth'] = _GERRIT_AUTHS[gerritUrl];

  if (opt_data) {
    if (settings.type == 'GET') {
      settings.data = opt_data;
    } else {
      settings.data = JSON.stringify(opt_data);
      settings.contentType = 'application/json';
    }
  }

  const uri = gerritUrl + path;
  const key = JSON.stringify([uri, settings.dataType, settings.data]);
  if (settings.type == "GET" && key in _outstandingRequests) {
    console.log("Collapsing calls", key);
  } else {
    _outstandingRequests[key] = $.ajax(uri, settings)
      .always(function() { delete _outstandingRequests[key]; });
  }

  return new Promise((resolve) => {
    _outstandingRequests[key]
      .done((data, textStatus, xhr) => {
        resolve({success: true, status: xhr.status, data: data})
      })
      .fail(async (xhr, textStatus, errorThrown) => {
        console.log("ajax error", xhr);
        if (xhr.status === 403 && xhr.responseText.trim() === "Authentication required") {
          console.log("403!  Try getting auth again");
          const auth = await initializeAuth(gerritUrl);
          if (auth.success) {
            console.log("Re-issuing ajax call using new token...");
            resolve(await ajax(gerritUrl, path, opt_type, opt_data, opt_opts, opt_dataType));
          } else {
            resolve({success: false, status: xhr.status, err_msg: xhr.responseText.trim()});
          }
        } else {
          err_msg = textStatus == "timeout" ? "Operation timed out" : xhr.responseText.trim();
          resolve({success: false, status: xhr.status, err_msg: err_msg});
        }        
      });
  });
}

function showDiffs(url, id) {
  chrome.tabs.create({url: `${url}/${id}`});
}

function login(url) {
  chrome.tabs.create({url});
}

function setup() {
  chrome.runtime.openOptionsPage();
}

function isAuthenticated(url) {
  return _GERRIT_AUTHS[url] !== undefined;
}

function gerritSettings() {
  const settingsString = localStorage["settings"];
  return settingsString ? JSON.parse(settingsString) : {};
}

function getGerritInstance(url) {
  const settings = gerritSettings();
  return _.find(settings.gerritInstances, inst => inst.url === url);
}

function hasSuccessfullyConnected() {
  return localStorage['hasSuccessfullyConnected'];
}


async function authenticate(gerritUrl) {
  const result = await initializeAuth(gerritUrl);

  if (result.success) {
    console.log("email: " + result.email + ", auth: " + _GERRIT_AUTHS[gerritUrl]);
    return {success: true, email: result.email};
  } else {
    return {success: false, err_msg: "Cannot authenticate"};
  }
}

function loadSettings(callback) {
  callback(gerritSettings());
  return true;
}

function getPopup() {
  const url = chrome.extension.getURL("popup.html");
  const views = chrome.extension.getViews();
  for (const view of views) {
    if (view.location.href == url) {
      return view;
    }
  }
  return null;
}

async function wrapChromeCall(func, args) {
  return new Promise((resolve) => {
    func.apply(null, args.concat(resolve));
  });
}

chrome.runtime.onUpdateAvailable.addListener(details => {
  console.log("Update available:", details);
  chrome.runtime.reload();
});

chrome.runtime.onInstalled.addListener(details => {
  console.log("Installed:", details);
  if (details.reason === "install") {
    setup();
  } else {
    migrate();
  }
});

DEFAULT_INBOX_QUERY = "(owner:self OR reviewer:self OR assignee:self) -age:7d";
function migrate() {
  if (localStorage["inboxQuery"] === undefined) {
    console.log("Setting initial inboxQuery");
    localStorage["inboxQuery"] = DEFAULT_INBOX_QUERY;
  }
  if (localStorage["settings"] === undefined) {
    console.log("Migrating to localStorage[settings]");
    if (localStorage["host"] !== undefined) {
      const migrated = {
        gerritInstances: [{
          url: localStorage["host"],
          gmail: localStorage["gmail"],
          botNames: localStorage["botNames"].split(",").map(n => n.trim()),
          inboxQuery: localStorage["inboxQuery"]
        }],
        contextLines: parseInt(localStorage["contexLines"]) || 10,
      };
      console.log("Migrated to:", migrated);
      localStorage["settings"] = JSON.stringify(migrated);
    } else {
      localStorage["settings"] = JSON.stringify({});
    }
  }
}
