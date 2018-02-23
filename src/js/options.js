function save() {
  const url = _validateUrl($("#url").val());
  if (url === false) {
    return false; 
  }
  const gmail = _validateEmail($("#gmail").val());
  if (gmail === false) {
    return false;
  }

  const context = _validateInt($("#context-lines").val());

  const botNames = $("#bot-names").val();

  const allowTracking = $("#allow-tracking").prop("checked");

  localStorage['host'] = url;
  localStorage['gmail'] = gmail;
  localStorage['contextLines'] = context;
  localStorage['botNames'] = botNames;
  

  const service = analytics.getService("gmail_gerrit_extension");
  service.getConfig().addCallback((config) => {
    config.setTrackingPermitted(allowTracking);
    _flashMessage("Saved! You should reload your Gmail tabs to reflect the changes.");
  });
  return false;
}

function _flashMessage(msg) {
  $(".message").text(msg).show();
  window.scrollTo(0, 0);
}

function _validateEmail(email) {
  if (email && email.indexOf("@") < 0) {
    _flashMessage(`Invalid email: ${email}`);
    return false;
  }
  return email;
}

function _validateInt(num) {
  if (!num || num.length === 0) {
    return undefined;
  } else {
    return parseInt(num);
  }
}

function _validateUrl(url) {
  if (url.length === 0) {
    _flashMessage("You must specify your Gerrit URL!");
    return false;
  }
  if (!(url.indexOf("http://") === 0 || url.indexOf("https://") === 0)) {
   _flashMessage(`Invalid URL; make sure it starts with http:// or https://: ${url}`);
    return false;
  }

  if (url.lastIndexOf("/") === (url.length - 1)) {
    url = url.substring(0, url.length - 1);
  } 
  return url;
}

function load() {
  $("#url").val(localStorage['host']);
  $("#gmail").val(localStorage['gmail']);
  $("#context-lines").val(localStorage['contextLines'] || "3");
  $("#bot-names").val(localStorage['botNames'] || "jenkins");
  const service = analytics.getService("gmail_gerrit_extension");
  tracker = service.getTracker("UA-114677209-1");
  tracker.sendAppView("options");
  service.getConfig().addCallback((config) => {
    $("#allow-tracking").prop("checked", config.isTrackingPermitted());
  });
}

function init() {
  $(".options-form").submit(save);
  load();
}

$(init);
