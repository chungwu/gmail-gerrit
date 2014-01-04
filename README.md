gmail-gerrit
============

Gerrit is great, but it sure sends a ton of emails.  For those of us who believe in code reviews _and_ prefer
small, logical, easy-to-digest commits, it means a ton of small code reviews clogging up our inboxes.  Most
of the code reviews are so simple and straightforward anyway (unless you're doing it wrong) that they can be
glanced at and approved quickly, and having to go to the Gerrit interface every time a review comes creates a
lot of friction.

This extension aims to implement a very basic Gerrit workflow into your Gmail, based on the emails Gerrit sends.
Specifically,

* It formats your Gerrit messages in Gmail.
  * New changes and patch sets will include colored, unified diffs of the changes.
  * Makes Gerrit emails easier to read by removing noise and highlighting important bits with HTML-formatting.
  * For new patch sets, the unified diffs included is diffed against the last-commented-upon patch set,
    rather than Base, so you can more easily track the evolution of the change.
* It incorporates Gerrit functionality in Gmail.
  * On unified diffs, double-click a line to comment on the line.
  * On comment emails, you can respond to a comment in-line from Gmail.
  * Convenient shortcuts: "w" to open change in Gerrit, and "W" to approve the change.
  * Approve, submit, rebase from Gmail.

Requirements
============

* Gerrit 2.8+, which contains most of the REST API endpoints necessary for the extension.
* Your email templates must include the following, in the footer or elsewhere:
  * A link to Gerrit for the change (`$email.changeUrl`)
  * `Gerrit-PatchSet: $patchSet.patchSetId`
  * `Gerrit-MessageType: $messageClass`

Right now, the extension is also very dumb and assumes a pretty much out-of-the-box Gerrit workflow -- that is, 
approving a change means Code-Review: +2.  It does not work with any custom labels, etc.

Setup
=====

In the Options page, a few things to set up:

* *Gerrit URL*: The URL of your Gerrit instance.  This must be set to enable the Gerrit extension.
* *Enabled Gmail Account*: The Gmail account that you use to recieve Gerrit emails.  This is in case you have multiple Gmail accounts and don't want to enable the Gerrit extension for all of them.
* *Context Lines*: Number of context lines to display in unified diffs.