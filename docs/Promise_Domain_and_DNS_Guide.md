# Promise: Domain & DNS Configuration Guide

This guide provides a complete overview of the best available domains for the Promise app and the exact DNS settings required to connect them to your live Vercel website.

---

## 1. Domain Recommendations & Availability

As of March 4, 2026, the premium `promise.app` domain is registered and unavailable. However, several excellent, brandable alternatives are available for immediate registration:

| Rank | Domain | Price (1st Year) | Registrar | Analysis |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **`promiseapp.io`** | ~€30 | [Namecheap](https://www.namecheap.com/domains/registration/results/?domain=promiseapp.io) | **Top Recommendation.** Clean, professional, and the `.io` TLD is well-regarded in the tech and startup space. |
| 2 | `keepyourpromise.io` | ~€30 | [Namecheap](https://www.namecheap.com/domains/registration/results/?domain=keepyourpromise.io) | Strong, memorable, and directly communicates the app's value proposition. A great brandable option. |
| 3 | `promiseapp.ai` | ~€68 | [Namecheap](https://www.namecheap.com/domains/registration/results/?domain=promiseapp.ai) | Highlights the AI-powered nature of the app, but comes at a higher price point. |
| 4 | `promiseapp.tech` | ~€8.50 | [Namecheap](https://www.namecheap.com/domains/registration/results/?domain=promiseapp.tech) | A budget-friendly option that is still relevant, though less premium than `.io` or `.ai`. |

**Action:** Please choose and purchase one of the domains from the links above to proceed. You do not need to purchase hosting or any other add-ons.

---

## 2. Vercel DNS Configuration (Ready to Use)

I have already configured the Vercel project to accept a custom domain. Once you have purchased your domain, you will need to update the DNS records at your registrar (e.g., Namecheap, GoDaddy) to point to Vercel. 

Here are the exact records you will need. The values are the same regardless of which domain you purchase.

### For the Root Domain (e.g., `promiseapp.io`)

*   **Type:** `A`
*   **Name/Host:** `@`
*   **Value/Points to:** `76.76.21.21`

### For the `www` Subdomain (e.g., `www.promiseapp.io`)

*   **Type:** `CNAME`
*   **Name/Host:** `www`
*   **Value/Points to:** `cname.vercel-dns.com`

**Important Note:** Vercel has recently updated its IP addresses. While the old values will work, it is recommended to use the latest ones for optimal performance. The values provided above are the most current.

### How to Add These Records (General Steps):

1.  Log in to your domain registrar's dashboard.
2.  Find the DNS management or DNS settings section for your new domain.
3.  Delete any existing `A` or `CNAME` records that may have been created by default.
4.  Create the two new records exactly as specified in the table above.
5.  Save your changes.

---

## 3. What Happens Next

*   **DNS Propagation:** It can take anywhere from a few minutes to 48 hours for your new DNS settings to take effect globally.
*   **SSL Certificate:** Vercel will automatically detect the new DNS records and issue a free SSL certificate for your domain, enabling HTTPS.
*   **Go Live:** Once propagation is complete, your website will be live at your new custom domain!

Your permanent Vercel deployment URL will continue to work: **https://promise-app-jet.vercel.app**

This completes the setup process. The next steps are in your hands to purchase the domain and apply these settings.
