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

Requirements
------------

* **Gerrit 2.8+**, which contains most of the REST API endpoints necessary for the extension.
* Your email templates must include the following, in the footer or elsewhere:
  * A link to Gerrit for the change (`$email.changeUrl`)
  * `Gerrit-PatchSet: $patchSet.patchSetId`
  * `Gerrit-MessageType: $messageClass`

Right now, the extension is also very dumb and assumes a pretty much out-of-the-box Gerrit workflow -- that is, 
approving a change means Code-Review: +2.  It does not work with any custom labels, etc.

Setup
-----

You can install the **[Chrome extension here](https://chrome.google.com/webstore/detail/gerrit-plugin-for-gmail/pffnmeolekgjhljdbgpbeaninomjppne)**.

Once you've installed the extension, in Chrome, go to Menu | Tools | Extensions, and next to the "Gerrit Plugin for Gmail" extension, click on the "Options" link.

In the Options page, a few things to set up:

* **Gerrit URL**: The URL of your Gerrit instance.  This must be set to enable the Gerrit extension.
* **Enabled Gmail Account**: The email address of the Gmail account that you use to recieve Gerrit emails.  This is in case you have multiple Gmail accounts and don't want to enable the Gerrit extension for all of them.
* **Context Lines**: Number of context lines to display in unified diffs.

Authentication
--------------

Right now the extension is using the same authentication you're using to use the Gerrit webapp; it's relying on the same cookies being sent and it's querying and extracting the XSRF token from the Gerrit HTML or the Gerrit cookie.  That means that to use the extension, you need to be logged into the Gerrit webapp as well.

