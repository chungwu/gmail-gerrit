function save() {
  var url = _validateUrl($("#url").val());
  if (!url) { 
    return false; 
  }
  localStorage['host'] = url;
  alert("Saved! You should reload your Gmail tabs to reflect the changes.");
  return true;
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
}

function init() {
  $(".options-form").submit(save);
  load();
}

$(init);
