Gerrit for Gmail Chrome Extension
=================================

Gerrit is great, and its review-per-commit model really encourages numerous small, logical, easy-to-digest code
reviews over a few monstrous ones -- just the way we prefer it.  However, that also means we end up doing a lot
of small code reviews that are so simple and straightforward, that often we'd rather just read and approve 
the change right when we receive the code review notification in Gmail or Inbox.  That's what this Chrome extension is -- 
a frictionless UI for performing your common Gerrit actions without leaving Gmail or Inbox.  It is a mini Gerrit client
built right into your Gmail.  If you use Gerrit, and you use Gmail or Inbox, this is for you.

This Chrome extension aims to implement a very basic Gerrit workflow into your Gmail/Inbox, based on the emails 
Gerrit sends.  Specifically,

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

*Change emails you receive will now contain nicely-formatted colored diffs. You can also double-click on a 
diff line to comment directly.*
![diffs](https://user-images.githubusercontent.com/773353/35765047-6ec6e0b8-0871-11e8-8dbb-eb9ab3df4f43.png)

*Comments are threaded together for easy browsing.  You can respond directly to comment threads.*
![comments2](https://user-images.githubusercontent.com/773353/36222329-d00a74ea-1175-11e8-9b42-29ff5b61f617.png)

*Gerrit emails in your inbox thread list will contain their current Gerrit status, and call out which ones 
require your attention.*
![threadlist](https://user-images.githubusercontent.com/773353/35765049-6ef13cd2-0871-11e8-9950-b24154fb9dd9.png)

*Works the same in Google Inbox!*
![inbox chungwu gmail com](https://user-images.githubusercontent.com/773353/37502859-6874d026-2892-11e8-8583-b978e445cb45.png)

*Viewing and commenting on diffs in Google Inbox*
![inbox-diffs](https://user-images.githubusercontent.com/773353/37502861-68a6cec8-2892-11e8-9ab8-086dcf00f557.png)

*Replying to comments in Google Inbox*
![inbox-comments](https://user-images.githubusercontent.com/773353/37502860-688d77a2-2892-11e8-9e08-553a1744e5f2.png)

Review Statuses
---------------
The extension derives more "actionable" code review statuses.  They are:
* Waiting -- the commit is yours, has been Verified+1, and you are waiting for reviews.
* To Respond -- the commit is yours, and currently has review comments that you haven't responded to yet.
* Reviewed -- you are a reviewer, and you have reviewed the latest patchset (or, you've commented after the commit owner).
* To Review -- you are a reviewer, and you need to review this (or, the commit owner has commented after you).
* Unverified -- the commit hasn't been Verified+1 yet.
* Failed Verify -- the commit is Verified-1.
* Approved -- the commit is Code-Review+2.
* Rejected -- the commit is Code-Review-1 or Code-Review-2.
* New -- the commit hasn't been reviewed yet.
* Merged -- the commit has been merged.
* Abandoned -- the commit has been abandoned.
* Merge Pending -- the commit has been submitted, but not yet merged.

Requirements
------------

* **Gerrit 2.8+**, which contains most of the REST API endpoints necessary for the extension.
* For formatting your Gerrit emails, your Gerrit email templates must include the following, in the footer or 
  elsewhere (they are all included in the default email templates):
  * A link to Gerrit for the change (`$email.changeUrl`)
  * `Gerrit-PatchSet:`
  * `Gerrit-MessageType:`
  * `Gerrit-Comment-Date:`
* For annotating your threadlist views in Gmail with Gerrit review status, your Gerrit email subject
  should contain the format `{$shortProjectName}[{$branch.shortName}]: {$change.shortSubject}`

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

* **Better reflection of configured Gerrit workflow.**  Allowing +1s and -2s, checking permission on actions you can
  actually perform, etc.
* **Use a "real" Gmail extension toolkit**, like [Gmail.js](https://github.com/KartikTalwar/gmail.js/tree/master) 
  or [InboxSDK](https://www.inboxsdk.com/).  Right now it is using some css selectors I grabbed one day and other
  random hacks, and I'm amazed they still work!
