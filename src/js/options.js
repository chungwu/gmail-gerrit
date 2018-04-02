function save() {
  const data = $(this).serializeJSON({
    checkboxUncheckedValue: "false",
    useIntKeysAsArrayIndex: true,
  });
  data.gerritInstances = _.compact(data.gerritInstances || []);
  
  for (const gerritInstance of data.gerritInstances) {
    gerritInstance.url = _validateUrl(gerritInstance.url);
    if (gerritInstance.url === false) {
      return false; 
    }
    gerritInstance.gmail = _validateEmail(gerritInstance.gmail);
    if (gerritInstance.gmail === false) {
      return false;
    }
    gerritInstance.botNames = gerritInstance.botNames.split(",").map(n => n.trim());
  }
  console.log("Saving", data);
  
  localStorage["settings"] = JSON.stringify(data);

  const allowTracking = data.allowTracking;
  const service = analytics.getService("gmail_gerrit_extension");
  service.getConfig().addCallback((config) => {
    config.setTrackingPermitted(allowTracking);
    _flashMessage("Saved! You should reload your Gmail or Inbox tabs to reflect the changes.");
  });
  return false;
}

function _flashMessage(msg) {
  $(".message").text(msg).show();
  window.scrollTo(0, 0);
  $("html, body").animate({scrollTop: 0}, "slow");
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

const DEFAULT_GERRIT_INSTANCE_OPTIONS = {
  inboxQuery: "(owner:self OR reviewer:self) -age:7d",
  botNames: "jenkins",
};

function load() {
  const settings = JSON.parse(localStorage["settings"]);
  console.log("Deserialized settings", settings);
  const gerritInstances = settings.gerritInstances || [];
  
  $gerritInstances = $("#gerrit-instances-group");
  if (gerritInstances.length == 0) {
    $gerritInstances.append(createGerritInstanceGroup(0, DEFAULT_GERRIT_INSTANCE_OPTIONS));
  }  else {
    for (const [index, value] of gerritInstances.entries()) {
      $gerritInstances.append(createGerritInstanceGroup(index, value));
    }
  }

  let nextIndex = $(".gerrit-instance-group").length;
  $(".add-gerrit-instance").click(() => {
    $gerritInstances.append(createGerritInstanceGroup(nextIndex, DEFAULT_GERRIT_INSTANCE_OPTIONS));
    nextIndex += 1;
  });

  $("input[name='contextLines:number']").val(settings.contextLines || 10);
  const service = analytics.getService("gmail_gerrit_extension");
  tracker = service.getTracker("UA-114677209-1");
  tracker.sendAppView("options");
  service.getConfig().addCallback((config) => {
    $("input[name='allowTracking:boolean']").prop("checked", config.isTrackingPermitted());
  });
}


function createGerritInstanceGroup(index, data) {
  const $group = $("#gerrit-instance-group-template").clone();
  $("input", $group).each(function() {
    const realName = $(this).attr("name").replace("${index}", `${index}`);
    $(this).attr("name", realName);
  });
  if (data) {
    for (const [key, val] of _.pairs(data)) {
      const inputName = `gerritInstances[${index}][${key}]`;
      const $input = $(`input[name="${inputName}"]`, $group);
      if (_.isArray(val)) {
        $input.val(val.join(", "));
      } else {
        $input.val(val);
      }
    }
  }
  $(".remove-gerrit-instance", $group).click(() => {
    $group.slideUp("fast", function() {$(this).remove();});
  });
  return $group.removeAttr("id").slideDown("fast");
}


function init() {
  $(".options-form").submit(save);
  load();
  $("form").on("click", ".help-icon", function() {
    const $parent = $(this).closest(".form-row");
    $(".form-help", $parent).toggle("fast");
  });
}

$(init);
