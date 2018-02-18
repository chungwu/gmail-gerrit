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
  } else if (!bg.isAuthenticated()) {
    $(".actions.unauthorized").show();
  } else if (!bg.hasSuccessfullyConnected()) {
    $(".actions.reload").show();
  } else {
    $(".actions.success").show();
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
    if (res.success) {
      chrome.extension.getBackgroundPage().showPage
    }
    refreshMessage();
  });
}