function save() {
  var url = _validateUrl($("#url").val());
  if (!url) { 
    return false; 
  }
  var gmail = _validateEmail($("#gmail").val());
  if (!gmail) {
    return false;
  }
  // var user = $("#user").val();
  // var password = $("#password").val();
  // if (!user || !password) {
  //   alert("You must enter your authentication info");
  //   return false;
  // }

  localStorage['host'] = url;
  localStorage['gmail'] = gmail;
  
  // localStorage['user'] = user;
  // localStorage['password'] = password;

  Alert("Saved! You should reload your Gmail tabs to reflect the changes.");
  return true;
}

function _validateEmail(email) {
  if (email.indexOf("@") < 0) {
    alert("Invalid email: " + email);
    return false;
  }
  return email;
}

function _validateUrl(url) {
  if (!(url.indexOf("http://") == 0 || url.indexOf("https://") == 0)) {
    alert("Invalid URL: " + url);
    return false;
  }

  if (url.lastIndexOf("/") == (url.length - 1)) {
    url = url.substring(0, url.length - 1);
  } 
  return url;
}

function load() {
  $("#url").val(localStorage['host']);
  //$("#user").val(localStorage['user']);
  //$("#password").val(localStorage['password']);
  $("#gmail").val(localStorage['gmail']);
}

function init() {
  $(".options-form").submit(save);
  load();
}

$(init);
