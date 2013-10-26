function save() {
  var url = $("#url").val();
  if (!(url.indexOf("http://") == 0 || url.indexOf("https://") == 0)) {
    alert("Please enter a valid URL");
    return false;
  }

  if (url.lastIndexOf("/") == (url.length - 1)) {
    url = url.substring(0, url.length - 1);
  }

  var user = $("#user").val();
  var password = $("#password").val();

  localStorage['host'] = url;
  localStorage['user'] = user;
  localStorage['password'] = password;
  alert("Saved! You should reload your Gmail tabs to reflect the changes.");
  return true;
}

function load() {
  $("#url").val(localStorage['host']);
  $("#user").val(localStorage['user']);
  $("#password").val(localStorage['password']);
}

function init() {
  $(".options-form").submit(save);
  load();
}

$(init);
