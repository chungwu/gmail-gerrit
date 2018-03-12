function contentHandler(request, sender, callback) {
  console.log("REQUEST", request);
  if (request.type == "loadChange") {
    return wrapAsyncHandler(loadChange(request.id), callback);
  } else if (request.type == "loadFiles") {
    return wrapAsyncHandler(loadFiles(request.id, request.revId), callback);
  } else if (request.type == "loadChanges") {
    return wrapAsyncHandler(loadChanges(), callback);
  } else if (request.type == "loadDiff") {
    return wrapAsyncHandler(loadDiff(request.id, request.revId, request.file, request.baseId), callback);
  } else if (request.type == "loadComments") {
    return wrapAsyncHandler(loadComments(request.id, request.revId), callback);
  } else if (request.type == "loadFileContent") {
    return wrapAsyncHandler(loadFileContent(request.id, request.revId, request.file), callback);
  } else if (request.type == "viewDiff") {
    return showDiffs(request.id);
  } else if (request.type == "commentDiff") {
    return wrapAsyncHandler(commentDiff(request.id, request.score, request.comment), callback);
  } else if (request.type == "submitDiff") {
    return wrapAsyncHandler(submitDiff(request.id), callback);
  } else if (request.type == "rebaseChange") {
    return wrapAsyncHandler(rebaseChange(request.id), callback);
  } else if (request.type == "submitComments") {
    return wrapAsyncHandler(submitComments(request.id, request.revId, request.review), callback);
  } else if (request.type == "settings") {
    return loadSettings(callback);
  } else if (request.type == "authenticate") {
    return wrapAsyncHandler(authenticate(), callback);
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

async function commentDiff(id, score, comment) {
  const url = `/changes/${id}/revisions/current/review`;
  const request = {};
  if (score !== undefined) {
    request.labels = {"Code-Review": score}
  }
  if (comment) {
    request.message = comment;
  }
  return ajax(url, 'POST', request);
}

async function submitDiff(id) {
  const url = `/changes/${id}/revisions/current/submit`;
  return ajax(url, 'POST', {wait_for_merge: true});
}

async function rebaseChange(id) {
  const url = `/changes/${id}/rebase`;
  return ajax(url, 'POST');
}

async function submitComments(id, revId, review) {
  const url = `/changes/${id}/revisions/${revId}/review`;
  return ajax(url, 'POST', review);
}

_RE_AUTH = /xGerritAuth="([^"]+)"/
_RE_USER = /"userName":"([^"]+)"/
_RE_EMAIL = /"preferredEmail":"([^"]+)"/
_GERRIT_AUTH = undefined;

function _extractRe(re, text) {
  const match = re.exec(text);
  return match ? match[1] : undefined;
}

async function initializeAuth() {
  return new Promise((resolve, reject) => {
    $.ajax(gerritUrl(), {timeout: 5000}).then(async (data) => {
      console.log("INITIAL DATA", data);
      const auth = _extractRe(_RE_AUTH, data);
      if (auth) {
        const email = _extractRe(_RE_EMAIL, data);    
        _GERRIT_AUTH = auth;
        resolve({email: email});
      } else {
        console.log("Failed to extract XSRF token from html; attempting to read from cookie");
        const resp = await wrapChromeCall(chrome.cookies.getAll, [{domain: new URL(gerritUrl()).hostname, name: "XSRF_TOKEN"}]);
        if (!resp || resp.length == 0 || !resp[0].value) {
          console.log("Failed to read XSRF_TOKEN from cookie :-/");
          _GERRIT_AUTH = undefined;
          reject();
        } else {
          _GERRIT_AUTH = resp[0].value;
          console.log("Found XSRF token", _GERRIT_AUTH);
          const details = await ajax("/accounts/self/detail");
          console.log("ACCOUNT DETAILS", details);
          if (details.success) {
            resolve({email: details.data.email});
          } else {
            reject();
          }
        }
      }
    });
  });
}

function wrapAsyncHandler(promise, callback) {
  (async () => {
    callback(await promise);
  })();
  return true;
}

function loadChanges() {
  const options = ['DETAILED_LABELS', 'MESSAGES', 'REVIEWED', 'DETAILED_ACCOUNTS'];
  const query = gerritInboxQuery();
  return ajax("/changes/", 'GET', {q: query, o: options}, {traditional: true});
}

async function loadChange(id) {
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
  return ajax(`/changes/${id}/detail`, 'GET', {o: options}, {traditional: true});
}

async function loadComments(id, revId) {
  let url = `/changes/${id}`;
  if (revId) {
    url += `/revisions/${revId}`;
  }
  url += "/comments/";
  return ajax(url);
}

async function loadDiff(changeId, revId, file, baseId) {
  const options = {intraline: true, context: "ALL"};
  if (baseId) {
    options.base = baseId;
  }
  return ajax(`/changes/${changeId}/revisions/${revId}/files/${encodeURIComponent(file)}/diff`, 'GET', options);
}

async function loadFiles(changeId, revId) {
  return ajax(`/changes/${changeId}/revisions/${revId}/files/`);
}

async function loadFileContent(changeId, revId, file) {
  const resp = await ajax(`/changes/${changeId}/revisions/${revId}/files/${encodeURIComponent(file)}/content`, undefined, undefined, undefined, "text");
  if (!resp.success) {
    return resp;
  } else {
    resp.data = atob(resp.data);
    return resp;
  }
}

const _outstandingRequests = {};
async function ajax(uri, opt_type, opt_data, opt_opts, opt_dataType) {
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
  settings.headers['X-Gerrit-Auth'] = _GERRIT_AUTH;

  if (opt_data) {
    if (settings.type == 'GET') {
      settings.data = opt_data;
    } else {
      settings.data = JSON.stringify(opt_data);
      settings.contentType = 'application/json';
    }
  }

  const key = JSON.stringify([uri, settings.dataType, settings.data]);
  if (settings.type == "GET" && key in _outstandingRequests) {
    console.log("Collapsing calls", key);
  } else {
    _outstandingRequests[key] = $.ajax(gerritUrl() + uri, settings)
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
          try {
            await initializeAuth();
            console.log("Re-issuing ajax call using new token...");
            resolve(await ajax(uri, opt_type, opt_data, opt_opts, opt_dataType));
          } catch (err) {
            resolve({success: false, status: xhr.status, err_msg: xhr.responseText.trim()});
          }
        } else {
          err_msg = textStatus == "timeout" ? "Operation timed out" : xhr.responseText.trim();
          resolve({success: false, status: xhr.status, err_msg: err_msg});
        }        
      });
  });
}

function showDiffs(id) {
  chrome.tabs.create({url:gerritUrl() + "/" + id});
}

function login() {
  chrome.tabs.create({url:gerritUrl()});
}

function setup() {
  chrome.runtime.openOptionsPage();
  // chrome.tabs.create({url:"options.html"});
}

function isAuthenticated() {
  return _GERRIT_AUTH !== undefined;
}

function gerritSettings() {
  const settingsString = localStorage["settings"];
  return settingsString ? JSON.parse(settingsString) : {};
}

function defaultGerritInstance() {
  const settings = gerritSettings();
  if (settings.gerritInstances && settings.gerritInstances.length > 0) {
    return settings.gerritInstances[0];
  } else {
    return undefined;
  }
}

function gerritUrl() {
  const settings = defaultGerritInstance();
  return settings ? settings['url'] : undefined;
}

function gerritGmail() {
  const settings = defaultGerritInstance();
  return settings ? settings['gmail'] : undefined;
}

function gerritInboxQuery() {
  const settings = defaultGerritInstance();
  return settings ? settings['inboxQuery'] : DEFAULT_INBOX_QUERY;
}

function gerritBotNames() {
  const settings = defaultGerritInstance();
  return settings ? settings['botNames'] : [];
}

function hasSuccessfullyConnected() {
  return localStorage['hasSuccessfullyConnected'];
}


async function authenticate() {
  try {
    const result = await initializeAuth();
    console.log("email: " + result.email + ", auth: " + _GERRIT_AUTH);
    return {success: true, email: result.email};
  } catch (err) {
    return {success: false, err_msg: "Cannot authenticate"};
  }
}

function loadSettings(callback) {
  // Temporarily continue with the same settings schema for gmgt, which doesn't yet support
  // having multiple Gerrit instances yet.
  const settings = gerritSettings();
  const tempSettings = {
    url: gerritUrl(), 
    gmail: gerritGmail(), 
    contextLines: settings["contextLines"] || 10,
    inboxQuery: gerritInboxQuery(),
    botNames: gerritBotNames()
  };
  callback(tempSettings);
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
