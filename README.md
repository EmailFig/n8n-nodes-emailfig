# @emailfig/n8n-nodes-emailfig

[EmailFig](https://emailfig.com) is email marketing without the bloat: fast, focused campaigns, easy list management, and pricing that scales fairly. It's free for up to 4,000 contacts.

This [n8n](https://n8n.io) community node keeps your EmailFig contacts, lists and tags in sync with the rest of your stack, and starts workflows when something happens in EmailFig.

## Installation

In n8n, open **Settings > Community Nodes**, choose **Install**, and enter `@emailfig/n8n-nodes-emailfig`. See n8n's [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Operations

**EmailFig**

| Resource | Operations |
|---|---|
| Contact | Create or Update, Get, Get Many, Update, Erase (Permanent), Unsubscribe, Add to List, Remove From List, Add Tags, Remove Tags |
| List | Get Many |
| Tag | Get Many |

**EmailFig Trigger** starts a workflow on New Contact, Contact Updated, Contact Unsubscribed, Contact Confirmed, Contact Cleaned, Contact Deleted, Contact Added to List, Contact Removed From List, Tag Added, Tag Removed, Form Submitted or Campaign Sent. List, tag and form events can be narrowed to one list, tag or form.

## Credentials

In EmailFig, go to **Settings > API keys**, create a key, and copy it. It's shown only once. In n8n, create an **EmailFig API** credential and paste the key. Leave **Base URL** as it is.

## Usage

- An empty field leaves the stored value unchanged.
- Joining a double opt-in list sends a confirmation email, and the contact stays pending until they confirm.
- Erase is permanent. If the contact had opted out, the address stays unsubscribed.
- EmailFig allows 300 requests every 5 minutes per API key. To sync a large audience, use Get Many's **Updated Since** filter rather than **Return All**.
- The trigger needs n8n on a public HTTPS address on port 443 (set `WEBHOOK_URL`; a tunnel works for testing). Deliveries are signed, so a proxy in front of n8n must pass them through unchanged.
- Each active trigger uses one of the 20 integration webhooks an EmailFig account allows.
- For anything else, use n8n's **HTTP Request** node with the **EmailFig API** credential, for example `GET https://emailfig.com/api/v1/campaigns`.

## Compatibility

Built against n8n 2.x.

## Resources

- [Connect EmailFig to n8n](https://emailfig.com/help/api/n8n)
- [EmailFig API reference](https://emailfig.com/docs)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Version history

See [CHANGELOG.md](CHANGELOG.md).
