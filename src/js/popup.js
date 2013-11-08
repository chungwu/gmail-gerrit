$(initialize);

function initialize() {
  $(".action-login").click(login);
  $(".action-setup").click(setup);
  var bg = chrome.extension.getBackgroundPage();
  $(".actions").hide();
  if (!bg.rbUrl()) {
    $(".actions.unsetup").show();
  } else {
    $(".actions.unauthorized").show();
  }
}

function login() {
  chrome.extension.getBackgroundPage().login();
}

function setup() {
  chrome.extension.getBackgroundPage().setup();
}