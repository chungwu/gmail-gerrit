$(initialize);

function initialize() {
  $(".action-setup").click(setup);
  refreshMessage();
}

async function refreshMessage() {
  const bg = chrome.extension.getBackgroundPage();
  const settings = bg.gerritSettings();
  const tab = await getCurrentTab();
  const validInsts = settings.gerritInstances.filter(inst => inst.url);
  const relevantInsts = validInsts.filter(inst => !inst.gmail || tab.title.indexOf(inst.gmail) >= 0);
  const unauthInsts = relevantInsts.filter(inst => !bg.isAuthenticated(inst.url));
  console.log("Unauth insts", unauthInsts);

  $(".actions").hide();
  if (validInsts.length == 0) {
    $(".actions.unsetup").show();
    showPopupIcon(false);
  } else if (unauthInsts.length > 0) {
    $(".actions.unauthorized").show();
    const $list = $("ul.unauth-urls").empty();
    for (const inst of unauthInsts) {
      $("<a/>").attr("target", "_blank").attr("href", inst.url).text(inst.url).appendTo($("<li/>").appendTo($list));
    }
    const $loginButton = $(".action-login");
    $loginButton.off("click").on("click", () => {
      for (const inst of unauthInsts) {
        bg.login(inst.url);
      }
    });
    const $authButton = $(".action-auth");
    $authButton.off("click").on("click", async () => {
      for (const inst of unauthInsts) {
        await bg.authenticate(inst.url);
      }
      refreshMessage();
    })
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
  const tab = await getCurrentTab();
  return tab ? tab.id : undefined;
}

async function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({active: true, currentWindow: true}, (res) => {
      if (res && res.length > 0) {
        resolve(res[0]);
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

function setup() {
  chrome.extension.getBackgroundPage().setup();
}
