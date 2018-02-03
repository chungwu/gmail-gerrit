Gerrit for Gmail Chrome Extension
=================================

Gerrit is great, and its review-per-commit model really encourages numerous small, logical, easy-to-digest code
reviews over a few monstrous ones -- just the way we prefer it.  However, that also means most code reviews
are so simple and straightforward, that often we'd rather just read and approve the change right when
we receive the code review notification in Gmail.  That's what this Chrome extension is -- a frictionless
UI for performing your common Gerrit actions without leaving Gmail.  If you use Gerrit, and you use Gmail,
this is for you.

This Chrome extension aims to implement a very basic Gerrit workflow into your Gmail, based on the emails Gerrit sends.
Specifically,

* On new patch set emails,
  * **Colored diffs** will be displayed for the patch set.  If this is not the first patch set, we diff it against
    the last-commented-upon patch set rather than the Base, so you can more easily track the evolution of the change!
  * Double-click on a diff line to make a comment.
* On new comment emails,
  * Comments from previous emails are threaded and displayed together, so that discussions on the same line are
    easier to follow.
  * You can reply to comments directly from Gmail.
* In the Inbox / threadlist view, status of Gerrit emails are displayed as either "New", "Merged", "Approved",
  "Needs Review", "Reviewed", "Waiting", "Rejected", or "Failed", so you can at a glance figure out which Gerrit 
  emails to pay attention to.
* You can approve and submit changes right from Gmail too.
* And some convenient shortcuts: "w" to open change in Gerrit, and "W" to approve the change.

Screenshots
-----------
These screenshots were taken of actual Gerrit code reviews from the 
[Gerrit repository](https://gerrit-review.googlesource.com).  Apologies to those featured here!

![diffs](https://user-images.githubusercontent.com/773353/35765047-6ec6e0b8-0871-11e8-8dbb-eb9ab3df4f43.png)
*Change emails you receive will now contain nicely-formatted colored diffs. You can also double-click on a 
diff line to comment directly.*

![respond](https://user-images.githubusercontent.com/773353/35765048-6edc356c-0871-11e8-93d4-e9c2b163d3e8.png)
*Comments are threaded together for easy browsing.  You can respond directly to comment threads.*

![threadlist](https://user-images.githubusercontent.com/773353/35765049-6ef13cd2-0871-11e8-9950-b24154fb9dd9.png)
*Gerrit emails in your inbox thread list will contain their current Gerrit status, and call out which ones 
require your attention.*

Requirements
------------

* **Gerrit 2.8+**, which contains most of the REST API endpoints necessary for the extension.
* Your email templates must include the following, in the footer or elsewhere:
  * A link to Gerrit for the change (`$email.changeUrl`)
  * `Gerrit-PatchSet: $patchSet.patchSetId`
  * `Gerrit-MessageType: $messageClass`
  * `Gerrit-Comment-Date: `

Right now, the extension is also very dumb and assumes a pretty much out-of-the-box Gerrit workflow -- that is, 
approving a change means Code-Review: +2.  It does not work with any custom labels, etc.

Setup
-----

You can install the extension for: 

* **[Chrome](https://chrome.google.com/webstore/detail/gerrit-plugin-for-gmail/pffnmeolekgjhljdbgpbeaninomjppne)**.
* **[Firefox](https://addons.mozilla.org/en-US/firefox/addon/gerrit-plugin-for-gmail/)**.

Once you've installed the extension, you need to configure it to work with your instance of Gerrit.

* In Chrome, go to Menu | More Tools | Extensions, and next to the "Gerrit Plugin for Gmail" extension, 
  click on the "Options" link.
* In Firefox, go to Menu | Add-Ons, and next to the "Gerrit Plugin for Gmail" extension, click on 
  the "Preferences" button.

In the Options page, a few things to set up:

* **Gerrit URL**: The URL of your Gerrit instance.  This must be set to enable the Gerrit extension.
* **Enabled Gmail Account** *(Optional)*: The email address of the Gmail account that you use to recieve Gerrit emails.  If
  you have multiple Gmail accounts, and only want to enable the Gerrit extension for one of them, put that
  email address here.  
* **Context Lines**: Number of context lines you'd like to display immediately before and after the 
  diffed line in unified diffs.
* **Bot names**: When we show diffs for a later patch set, we diff it against the last-commented-upon patch set,
  so you can more easily track the evolution of the change.  However, there are bots that comment on _every_ patch
  set (like CI / build bots, etc.), so if you want to exclude them from being considered for "last-commented-upon"
  patch set, you can list their usernames here.

Authentication
--------------

Right now the extension is using the same authentication you're using to use the Gerrit webapp; it's relying on the 
same cookies being sent and it's querying and extracting the XSRF token from the Gerrit HTML or the Gerrit cookie.  
That means that to use the extension, you need to be logged into the Gerrit webapp as well.

Development
-----------

This extension was written a long time ago.  There are no tests, it uses jQuery templates to render DOM (remember those?),
and the code is in general poorly documented and unpleasant to read.  Too bad!

My wish list for features I'd like to see include:

* **Support for multiple Gerrit repositories.**  Right now you can only configure one.
* **Better reflection of configured Gerrit workflow.**  Allowing +1s and -2s, checking permission on actions you can
  actually perform, etc.
* **Use a "real" Gmail extension toolkit**, like [Gmail.js](https://github.com/KartikTalwar/gmail.js/tree/master) 
  or [InboxSDK](https://www.inboxsdk.com/).  Right now it is using some css selectors I grabbed one day and other
  random hacks, and I'm amazed they still work!
