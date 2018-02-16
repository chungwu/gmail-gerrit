$(initialize);

function initialize() {
  $(".action-login").click(login);
  $(".action-setup").click(setup);
  var bg = chrome.extension.getBackgroundPage();
  $(".actions").hide();
  if (!bg.gerritUrl()) {
    $(".actions.unsetup").show();
  } else if (!bg.isAuthenticated()) {
    $(".actions.unauthorized").show();
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