var rbId = null;
var status = null;

$(initialize);

function initialize() {
  $(".action-approve").click(approveReview);
  $(".action-view").click(showReview);
  $(".action-diff").click(showDiffs);
  $(".action-login").click(login);
  $(".action-setup").click(setup);
  var bg = chrome.extension.getBackgroundPage();
  bg.getRbId(function(id) {
    rbId = id;

    bg.reviewStatus(rbId, function(data) {
      status = data.status;
      if (status == "unauthorized") {
        renderStatus("Unauthorized; please log in.");
      } else if (status == "approved") {
        renderStatus("Approved!", "approved");
      } else if (status == "unapproved") {
        renderStatus("Unapproved");
      } else if (status == "unsetup") {
        renderStatus("You need to set up the ReviewBoard extension first!");
      }
      renderActions();
    });
  });
}

function showDiffs() {
  chrome.extension.getBackgroundPage().showDiffs(rbId);
}

function showReview() {
  chrome.extension.getBackgroundPage().showReview(rbId);
}

function login() {
  chrome.extension.getBackgroundPage().login(rbId);
}

function setup() {
  chrome.extension.getBackgroundPage().setup();
}

function approveReview() {
  renderStatus("Approving...");
  chrome.extension.getBackgroundPage().approveRb(rbId, function(success) {
    renderStatus("Approved!", "approved");
  });
}

function renderStatus(text, opt_class) {
  $(".status-text").attr("class", "status-text");
  $(".status-text").text(text);
  if (opt_class) {
    $(".status-text").addClass(opt_class);
  }
}

function renderActions() {
  $(".actions").hide();
  if (status == "unauthorized") {
    $(".actions.unauthorized").show();
  } else if (status == "unsetup") {
    $(".actions.unsetup").show();
  } else {
    $(".actions.norm").show();
  }
}

