$(initialize);

function initialize() {
  $(".action-login").click(login);
  $(".action-setup").click(setup);
  $(".action-auth").click(authenticateAgain);
  refreshMessage();
}

function refreshMessage() {
  const bg = chrome.extension.getBackgroundPage();
  $(".actions").hide();
  if (!bg.gerritUrl()) {
    $(".actions.unsetup").show();
    showPopupIcon(false);
  } else if (!bg.isAuthenticated()) {
    $(".actions.unauthorized").show();
    showPopupIcon(false);
  } else if (!bg.hasSuccessfullyConnected()) {
    $(".actions.reload").show();
    showPopupIcon(false);
  } else {
    $(".actions.success").show();
    showPopupIcon(true);
  }
}

async function getCurrentTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({active: true, currentWindow: true}, (res) => {
      if (res && res.length > 0) {
        resolve(res[0].id);
      } else {
        resolve(undefined);
      }
    });
  });
}

async function showPopupIcon(isSuccess) {
  const tabId = await getCurrentTabId();
  if (tabId !== undefined) {
    const bg = chrome.extension.getBackgroundPage();
    if (isSuccess) {
      console.log("Showing success");
      bg.showPageActionSuccess(tabId);
    } else {
      console.log("Showing error");
      bg.showPageActionError(tabId);
    }
  }
}

function login() {
  chrome.extension.getBackgroundPage().login();
}

function setup() {
  chrome.extension.getBackgroundPage().setup();
}

function authenticateAgain() {
  chrome.extension.getBackgroundPage().authenticate((res) => {
    refreshMessage();
  });
}