# VÉLORA — Owner's guide

This guide is for the store owner. It assumes no programming knowledge. Every task is
written the same way:

- **Where** — the screen or website you go to
- **What** — what you are doing
- **Why** — why it matters
- **How** — the steps
- **Result** — what you should see when it worked

The back office is in Arabic by default. Button names are given in Arabic as they appear
on screen, with English in brackets. The language button in the top bar switches the whole
back office to English.

Tasks marked **Developer** need someone who can edit the hosting configuration. Everything
else is done in the back office, without changing code.

---

## 1. What you are running

| | The shop (customers) | The back office (you and your team) |
| --- | --- | --- |
| Address | `https://your-domain/ar` (Arabic), `/en` (English) | `https://your-domain/admin` |
| Who can enter | Anyone; buying needs a customer account | Only accounts with the **Administrator** or **Staff** role |
| What it does | Browse, search, bag, checkout, track orders, returns, reviews | Products, stock, orders, payments, refunds, returns, customers, coupons, content, settings, team |

Everything you change in the back office is saved in the database and appears in the shop
**immediately**: there is no "publish the website" step and no code to edit.

**Customers can never reach the back office.** We tested this on the running system:
- A signed-in customer who opens `/admin` sees "لا تملك صلاحية الوصول" (you do not have access).
- They cannot create products, change stock, refund, change settings or create staff.
- They cannot open another customer's orders or addresses.
- They cannot make themselves an administrator.

---

## 2. Your owner account

### 2.1 Create the real owner account (once, at launch) — Developer

- **Where**: the hosting environment, with the production database connection.
- **What**: create the administrator account you will use, with your own email and a strong password.
- **Why**: the development system ships with a test administrator (`admin@velora.local` /
  `ChangeMe123!`). That account is for development only. It must never exist in
  production, because anyone who has read the code knows its password.
- **How**: your developer runs `npm run admin:create -- --email you@your-domain --name "Your Name"`.
  You type the password yourself at a hidden prompt; it is never shown or saved anywhere in
  readable form. It must be at least 12 characters. The developer then runs
  `npm run admin:create -- --suspend-dev-accounts`.
- **Result**: "Administrator created". The test accounts are suspended. The production setup
  also refuses to load the demo data and test accounts. We rehearsed this on an empty
  database: only your account existed afterwards.

### 2.2 Sign in

- **Where**: `https://your-domain/admin`
- **How**: you are sent to the sign-in page. Enter your email and password.
- **Result**: the dashboard "الرئيسية" (Home).
- Repeated sign-in attempts are blocked for a while (this happened during our testing).
  The error message never says whether the email exists.

### 2.3 Change your password

- **Where**: back office → top bar → **كلمة المرور** (Password)
- **Why**: change it if you think someone else knows it, or when a staff member leaves.
- **How**: enter the current password, then the new one twice.
- **Result**: a success message. The old password stops working straight away. We tested
  this on the running system.
- **Forgot your password?** Use "نسيت كلمة المرور" (Forgot password) on the sign-in page. The
  email only arrives once a real email service is connected (section 9). Until then a
  developer can reset it with `npm run admin:create -- --email you@your-domain --name "Your Name" --reset`.

### 2.4 Add staff

- **Where**: back office → **فريق العمل** (Team)
- **What**: invite an employee and choose what they may do.
- **Why**: give each person only the permissions they need. Out of the box, staff can see
  orders, prepare and ship them, and adjust stock. They cannot refund, edit products,
  change settings or manage the team.
- **How**: add the person's name and email and choose **Staff**. They receive an email
  link to set their own password. Adjust what staff may do in the same screen.
- **Result**: they sign in at `/admin` and see only their sections. When someone leaves,
  suspend their account there.
- Managing the team is **always** administrator-only. A staff member can never give
  themselves more rights; we tested this.

---

## 3. Every day

### 3.1 The dashboard

- **Where**: back office → **الرئيسية** (Home)
- **What it shows**:
  - today's and recent sales;
  - orders by status;
  - the **"بانتظار الفريق"** (Waiting for the team) panel:
    - orders with a payment problem;
    - cash-on-delivery orders waiting for your confirmation;
    - orders ready to ship;
    - returns to review, and returns received that need refunding;
    - pending refunds;
    - low-stock items;
    - reviews waiting for approval;
    - new contact messages;
    - emails that failed.
- **What to do**: work through that panel every morning. Each line opens the list behind it.

### 3.2 New order alerts

- Every new order is emailed to the **store email** in **الإعدادات → معلومات المتجر**
  (Settings → Store information):
  - cash-on-delivery orders as soon as they are placed;
  - card orders as soon as the payment succeeds.
- Return requests and contact-form messages go to the same address.
- These emails are only delivered once an email service is connected (section 9). Until then,
  check **الطلبات** (Orders) in the back office.

### 3.3 Handling an order

- **Where**: back office → **الطلبات** (Orders) → click the order number
- **What**: move the order forward step by step. The buttons offered always match the
  order's current state. Steps that don't apply are not shown.

| Status (Arabic / English) | What it means | What you do next |
| --- | --- | --- |
| قيد الانتظار / Pending | Just placed. Card orders: waiting for payment. Cash on delivery: waiting for you. | Cash on delivery: call or message the customer, then **تأكيد الطلب** (Confirm order). Card orders confirm themselves when the payment succeeds. |
| مؤكَّد / Confirmed | Accepted. The item is now sold, and stock is reduced. | **بدء التجهيز** (Start preparing) |
| قيد التجهيز / Processing | Being packed. | Print the **إيصال التعبئة** (Packing slip) and the **الفاتورة** (Invoice); book the courier; then **شحن الطلب** (Ship) and enter the carrier and tracking number. |
| تم الشحن / Shipped | With the courier. The customer receives an email with the tracking link. | When the courier reports it: **خرج للتوصيل** (Out for delivery) |
| خرج للتوصيل / Out for delivery | On the way today. | When delivered: **تم التوصيل** (Delivered) |
| تم التوصيل / Delivered | Done. Cash on delivery is recorded as collected. The return window starts. | Nothing, unless a return request arrives. |
| ملغى / Cancelled | Cancelled by you, the customer, or automatically (an unpaid card order after the hold time). Stock goes back automatically. Card payments are refunded automatically. | Nothing. |
| مسترد / Refunded | Money returned. | Nothing. |

**Payment status** is shown next to it:
- **بانتظار الدفع** (Awaiting payment);
- **مدفوع** (Paid);
- **فشل الدفع** (Payment failed);
- **مسترد** / **مسترد جزئياً** (Refunded / Partly refunded).

An order is only "Paid" when the payment company itself confirms it to the server. A
customer landing on a "payment successful" page proves nothing, and the system ignores it.
We tested a forged "paid" link: the order stayed unpaid.

**Cancelling**: **إلغاء الطلب** (Cancel order). Give a reason. Stock returns to the shelf.
For a card payment, the refund goes back to the card through the payment company.

**Refunding part of an order**: **استرداد مبلغ** (Refund).
- Card payments are refunded through the payment company.
- Cash on delivery is refunded by bank transfer: make the transfer first, then record its reference here.

### 3.4 Returns

- **Where**: back office → **المرتجعات** (Returns)
- **Flow**:
  1. The customer asks for a return within the return window (default 7 days after delivery; change it in Settings → الإرجاع / Returns).
  2. You **approve** or **reject** it, with a note the customer sees.
  3. When the parcel comes back, **receive** it and mark each item as resellable or damaged.
  4. **Complete** the return: the refund is issued, and resellable items go back into stock.
- Every step emails the customer, once email is connected.

### 3.5 Customers, reviews, messages

- **العملاء** (Customers): order history and contact details. You can suspend an abusive account.
  Passwords are never visible to anyone, including you.
- **التقييمات** (Reviews): by default only verified buyers can review, and nothing is published until you approve it.
- **رسائل التواصل** (Contact messages): messages sent from the contact page.

---

## 4. Products

### 4.1 Add a new handbag — step by step

- **Where**: back office → **المنتجات** (Products) → **منتج جديد** (New product)
- **Why**: a product exists in the shop only when it has a name, a price, a category, at
  least one option (colour or size) with stock, and a photo.

1. **الاسم بالعربية / الاسم بالإنجليزية** — the name in Arabic and English, for example "حقيبة لونا الكتفية" / "Luna Shoulder Bag".
2. **الرابط** — press **إنشاء من الاسم** (Create from name) under each language. This is the web address of the product page.
3. **رمز المنتج (SKU)** — your own product code, for example `VLR-BAG-LUNA`. Capital letters, numbers and dashes. It must be unique.
4. **الوصف** — the description in both languages.
5. **سعر البيع (ر.س)** — the selling price in riyals, for example `1250`. With the default settings this price **includes** 15% VAT. The system works out the VAT part itself.
6. **السعر قبل الخصم** (Compare-at price) — optional. Enter the old price, for example `1500`, to show it struck through next to the sale price. Leave it empty when there is no discount.
7. **التكلفة** (Cost) — optional, for you only. Customers never see it.
8. **الفئة** (Category) — for example "الشنط" (Bags).
9. **العلامة التجارية** (Brand) — optional.
10. **الفئة المستهدفة** — Women, Men or Unisex. This drives the "women" and "men" sections of the shop.
11. **الخامة / العناية** — material and care instructions, in both languages.
12. **الطول / العرض / الارتفاع (مم)** and **الوزن (غ)** — size in millimetres and weight in grams. They are shown on the product page.
13. **الخيار الأول والمخزون الافتتاحي** (First option and opening stock):
    - **رمز الخيار** — a code for this colour, for example `VLR-BAG-LUNA-BLK`;
    - **اسم الخيار** — for example "أسود" / "Black";
    - **عائلة اللون** — the colour family used by the shop's colour filter, for example Black;
    - **اسم اللون** and **كود اللون** — for example `#111111`, which draws the colour swatch;
    - **المقاس** — size, if any;
    - **المخزون الافتتاحي** — how many pieces you have, for example `5`.
14. **الحالة** (Status) — leave it as **مسودة** (Draft) for now.
15. **حد التنبيه لانخفاض المخزون** — the dashboard warns you when stock reaches this number (default 3).
16. **مميز / الأكثر مبيعاً / وصل حديثاً** — tick these to show the bag in those sections of the home page.
17. **محركات البحث** (SEO) — optional title and description for Google. When empty, the name and description are used.
18. Press **إنشاء** (Create). You land on the product's own page with the message "تم إنشاء المنتج. أضف الصور ثم انشره." (Product created. Add photos, then publish it.)
19. **الصور** (Photos) → **رفع صورة** (Upload photo), and choose the photo. Repeat for more photos.
20. The **first** photo is the **main photo** (labelled "الصورة الرئيسية"). Use the up and down arrows to change the order.
21. Fill in the **النص البديل** (alternative text) under each photo, a short description for blind visitors and for Google, and press **حفظ النص البديل** (Save alternative text).
22. To add another colour: **الخيارات والمخزون** (Options and stock) → **إضافة خيار** (Add option). Fill it in like step 13, choose that colour's photo in **الصورة**, set its opening stock, and save.
23. An option can have its own price (**سعر خاص**). Leave it empty to use the product price.
24. Scroll to **الحالة** (Status), choose **منشور** (Published), and press **حفظ** (Save).
25. Press **عرض في المتجر** (View in store) at the top.
26. **Result**: the bag's page opens in the shop with its price, the struck-through old price, the colours and the "أضف إلى السلة" (Add to bag) button. It also appears in its category and in search.

**If publishing is refused**: the message tells you why. Either there is no photo yet
("أضف صورة واحدة على الأقل قبل النشر") or no active option. A draft is invisible to
customers: its page answers "not found".

We ran exactly this sequence automatically on a production build: create → draft hidden →
publish refused without a photo → upload → publish → visible with the correct prices →
found by search.

### 4.2 Photos

| Question | Answer |
| --- | --- |
| Which files? | JPEG, PNG, WebP or AVIF. Other files are refused, whatever their name says. |
| How large? | At most 8 MB, and the shorter side must be at least 600 pixels. 1600–2400 pixels on the long side looks best. |
| What happens to them? | Each photo is checked and converted to WebP. Its hidden camera and location data (EXIF/GPS) is deleted. |
| Main photo | The first one. Reorder with the arrows. |
| Delete | **حذف الصورة** (Delete photo) under the photo, then confirm. |
| Photo per colour | When editing an option, choose its photo in **الصورة**. |
| Where are they stored? | In development, on the computer running the site. In production they **must** go to cloud storage (section 8.4). The server refuses to start in production without it. |

### 4.3 Change a price

- **Where**: Products → the product → **السعر** (Price) → **حفظ** (Save)
- **Result**: the shop shows the new price immediately. Orders already placed keep the price
  they were bought at. We tested this: after changing 1,250 to 1,100, the product page showed
  1,100 at once.
- **Run a sale**: enter the old price in **السعر قبل الخصم** and the sale price in **سعر البيع**.
  For a store-wide discount, use **الكوبونات** (Coupons) instead.

### 4.4 Hide or retire a product

- **Hide temporarily**: set the status to **مسودة** (Draft).
- **Retire**: set it to **مؤرشف** (Archived). Old orders still show it correctly.
- **Delete**: only possible for a product that was never ordered. Otherwise archive it.

---

## 5. Stock

### 5.1 How stock moves (automatic)

| Event | On the shelf ("في المستودع") | Reserved ("محجوز") | Available to buy ("متاح") |
| --- | --- | --- | --- |
| A customer places an order | — | +1 | −1 |
| The order is paid (card) or confirmed (cash on delivery) | −1 | −1 | — |
| An unpaid card order expires (default 30 minutes), or an order is cancelled before confirmation | — | −1 | +1 |
| A confirmed order is cancelled | +1 | — | +1 |
| A return is received as resellable | +1 | — | +1 |

- Stock can **never** go below zero. When two customers try to buy the last piece at the same
  moment, exactly one succeeds. The other is told the item is no longer available. We tested
  this with two real customers at the same instant: one got the order, the other got "out of stock".
- When available stock is 0, the shop shows **"نفدت الكمية"** (Sold out) and the add-to-bag
  button is disabled.

### 5.2 Receive new stock, write off damage, correct a count

- **Where**: back office → **المخزون** (Inventory) → search the code → open the option
- **How**: choose the movement type, enter the quantity and the reason, then press **تسجيل الحركة** (Record movement):
  - **استلام بضاعة** (Stock received) — add pieces;
  - **إتلاف** (Write off) — remove damaged pieces;
  - **جرد** (Count) — enter the number you actually counted, and the system corrects the difference.
- **Result**: the numbers update. **سجل الحركات** (Movement history) shows every movement for ever:
  date, type, before → after, who did it, and why. Nobody can edit or delete history.

### 5.3 Low stock

- The dashboard lists options at or below their alert level. **المخزون** (Inventory) can filter to
  **منخفض** (Low) or **نافد** (Out).
- There is no low-stock **email**: check the dashboard.

---

## 6. Settings you must fill in before launch

**Where**: back office → **الإعدادات** (Settings). Changes apply immediately. The values
that ship with the system are **placeholders, not recommendations**: replace every one.

| Section | What to set |
| --- | --- |
| معلومات المتجر (Store) | Store and legal name, the **store email** (receives order alerts), phone, WhatsApp number, address, commercial registration number, VAT number, social links. |
| الشحن (Shipping) | Standard and express fees, the free-shipping threshold, delivery times. Placeholders: 25 / 45 SAR, free from 299 SAR, 2–5 / 1–2 days. |
| ضريبة القيمة المضافة (VAT) | Rate (15%), whether prices include VAT, whether shipping is taxed. See section 11. |
| الدفع عند الاستلام (Cash on delivery) | On or off, its fee, minimum and maximum order. Placeholders: 15 SAR fee, 50–3,000 SAR. |
| إتمام الطلب (Checkout) | How long unpaid card orders hold stock (30 minutes); when customers may cancel (Pending and Confirmed); maximum quantity per item; email verification before ordering. |
| طرق الدفع (Payment methods) | Which methods to offer. Only those the connected payment company supports are shown. |
| الإرجاع (Returns) | Accept returns or not, and the number of days. The returns policy page updates automatically. |
| التقييمات (Reviews) | Buyers only; approve before publishing. |
| محركات البحث (SEO) | Home page title and description for Google. |
| التكاملات (Integrations) | Shows which services are **live**, **simulated** or **off**. It never shows secret keys. |

The **الصفحات** (Pages) section edits About, Shipping, Returns, Privacy and Terms.
**الأسئلة الشائعة** (FAQ) and **البنرات** (Banners) edit the rest of the content.

---

## 7. What is connected today, and what is not

| Service | Status today | What it means |
| --- | --- | --- |
| Database (PostgreSQL) | **Working** | Everything is stored there and read live. Nothing in the shop is hard-coded. |
| Payments | **Simulated** | A test payment page. No money moves. The back office shows a yellow "test mode" bar. Moyasar is written into the system but not connected: no keys are configured, and it has not yet been tried against a real Moyasar account. |
| Shipping | **Simulated** (development) / **Manual** (production) | Not connected to any courier. You book the courier yourself and type the tracking number. |
| Email | **Simulated** | Every email is produced and logged in **سجل الإشعارات** (Notifications log) but **not delivered**. |
| SMS / WhatsApp | **Not connected** | Nothing is sent. The WhatsApp number in Settings only appears as a chat link on the contact page. |
| Photo storage | **Local** (development only) | Production needs cloud storage (section 8.4). |
| Google Analytics | **Off** | Optional. |
| ZATCA e-invoicing | **Not available** | See section 11. |

---

## 8. Going live: outside services

Prices change and depend on your plan or contract, so none are quoted here. Each item says
what determines the cost.

### 8.1 Domain — `.sa` or `.com`

- **What**: your web address, for example `velora.sa` or `velora-store.com`.
- **Choosing**:
  - `.sa` (or `.com.sa`) signals a Saudi business. It is registered through SaudiNIC (nic.sa)
    or its accredited registrars. It usually requires Saudi documents such as a commercial
    registration: check SaudiNIC's current rules.
  - `.com` is available instantly from any registrar.
  - Many stores buy both and point one at the other.
- **How**: buy it at a registrar; later you will add the DNS records your hosting company gives you (8.2).
- **Cost**: **Verify current pricing.** It depends on the extension, the registrar and the number of years.

### 8.2 Hosting — Vercel (recommended)

- **Why Vercel**: the system ships ready for it. Other Node.js hosts also work.
- **How** (developer, or yourself with the developer's help):
  1. Create a Vercel account and import the GitHub repository.
  2. In **Settings → Environment Variables**, enter the values from section 13.
  3. Deploy, then in **Settings → Domains** add your domain and copy the DNS records it shows to your registrar.
  4. Vercel issues the HTTPS certificate automatically.
- **Important**: the system runs three automatic jobs:
  - every minute: send emails;
  - every 5 minutes: release stock held by unpaid orders;
  - hourly: clean-up.

  Vercel's free plan has historically run scheduled jobs at most once a day. You will need
  a paid plan or an external scheduler; check Vercel's current plan limits.
- **Cost**: **Verify current pricing.** It depends on the plan and on traffic.

### 8.3 Database hosting

- **What**: a managed PostgreSQL 16 database, for example Neon, Supabase, AWS RDS or Crunchy Bridge.
- **Choose**:
  - point-in-time recovery, so you can restore to any minute;
  - daily backups kept elsewhere;
  - a region close to your hosting.
- Saudi Arabia's Personal Data Protection Law (PDPL) has rules on transferring personal data
  outside the Kingdom. Ask a legal adviser whether your chosen region is acceptable.
- **Cost**: **Verify current pricing.** It depends on size, backups and region.

### 8.4 Photo storage

- **What**: an S3-compatible bucket, for example Cloudflare R2, AWS S3 or Supabase Storage. Photos must be publicly readable.
- **Cost**: **Verify current pricing.** It depends on gigabytes stored and traffic.

### 8.5 Payments — Moyasar

- **Status**: the code is written for Moyasar's hosted payment page: mada, Visa/Mastercard,
  Apple Pay and STC Pay. Card numbers never touch your server. It is **not connected** and has
  **not yet been tested against a real Moyasar account**.
- **Open the account**: apply at moyasar.com. They will ask for business documents. Which
  payment methods are enabled (for example Apple Pay and STC Pay) depends on your account:
  confirm with Moyasar.
- **Test first (sandbox)**: Moyasar provides **test keys**, which start `pk_test_` and
  `sk_test_`. Use them on a **staging** copy of the site. Pay with Moyasar's published test
  cards. **Never use real cards or real money while testing.**
- **Connect** (developer):
  1. Set `PAYMENT_PROVIDER=moyasar`, and `MOYASAR_PUBLISHABLE_KEY`, `MOYASAR_SECRET_KEY` and `MOYASAR_WEBHOOK_SECRET`.
  2. In the Moyasar dashboard, add the webhook address `https://your-domain/api/webhooks/payments/moyasar` with the same secret.
- **Test matrix on staging, before live**:
  - a successful payment → the order is paid and confirmed;
  - a declined card → the order is cancelled and stock released;
  - the customer closes the payment page → the order stays unpaid, and is cancelled after 30 minutes;
  - a full refund and a partial refund from the back office, both visible in Moyasar;
  - the yellow test bar disappears from the back office only when real providers are live.
- **Go live**: swap in the **live** keys (`pk_live_`, `sk_live_`). Place one small real order
  yourself, refund it, and check that both appear in Moyasar.
- **Cost**: **Verify current pricing.** Fees are per transaction, differ for mada, credit cards
  and wallets, and depend on your contract.

### 8.6 Shipping companies

- **Status**: no courier is connected. That is deliberate and works in production:
  1. book the parcel in the courier's own system or with their driver;
  2. press **شحن الطلب** (Ship);
  3. choose SPL, SMSA, Aramex or "other", and enter the tracking number.

  The customer's tracking link is built automatically for SPL, SMSA and Aramex.
- **Choosing a courier**: Saudi Post (SPL), SMSA, Aramex and others. Ask each for a business
  account, rates per zone and weight, cash-on-delivery collection, and how quickly they pay out
  collected cash.
- **Cost**: **depends on your contract** with the courier (zones, weights, volume, COD handling).
  Not quotable here.
- An automatic courier connection (labels and live tracking) can be added later. It is not built.

### 8.7 Email — Resend

- **Why**: without it, customers get no order confirmations and you get no order alerts.
- **How** (developer):
  1. Create a Resend account and add your domain.
  2. Copy the DNS records it shows (SPF/DKIM) to your registrar, and wait for "verified".
  3. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` (for example `VÉLORA <orders@your-domain>`).
- **Emails the system sends** (Arabic or English, in the customer's language):
  - account: welcome, verify email, password reset, password changed, staff invitation;
  - orders: order received (cash on delivery), payment confirmed, order confirmed (cash on delivery), payment failed, shipped (with tracking), delivered, cancelled, refunded;
  - returns: return received, approved, rejected, completed;
  - to you: new order, new return request, new contact message.
- **Check**: **سجل الإشعارات** (Notifications log) shows every email with its status. Failed ones have a **retry** button.
- **Cost**: **Verify current pricing.** It depends on monthly email volume.

### 8.8 SMS and WhatsApp

- **Status**: **not connected. Nothing is sent.** This was not faked.
- To add them later you need:
  - a provider (for example an SMS gateway with a registered sender name, or a WhatsApp Business API provider);
  - approved message templates;
  - development work to connect them.
- **Cost**: **Verify current pricing.** Charged per message, and it depends on the provider and message type.

---

## 9. Email for your own mailbox

The store email in Settings receives the order alerts. Use a mailbox someone reads every
day, for example `orders@your-domain`, set up with your domain's email provider. This is
separate from Resend, which only sends emails.

---

## 10. Your first real order — what happens, step by step

Example: a customer buys one Luna bag at 1,250 SAR and pays by mada.

| Step | What the customer sees | What changes in the database |
| --- | --- | --- |
| 1. Adds the bag | It appears in their bag. | The bag line is saved. Prices are always recalculated by the server, never trusted from the browser. |
| 2. Checks out | The total with shipping and VAT. | The order is created as **Pending / Awaiting payment**, with a copy of names and prices as bought. 1 piece is **reserved**. An "order placed" event is queued. |
| 3. Pays on Moyasar's page | Moyasar's page, then back to VÉLORA. | Nothing yet: the return page is not trusted. |
| 4. Moyasar confirms to the server | "Payment confirmed", and the order confirmation page. | The payment and order become **Paid** and **Confirmed**. The reservation becomes a **sale**: on the shelf −1, reserved −1. The customer's "payment confirmed" email and **your "new order" alert** are sent. |
| 5. You prepare and ship | "Shipped", with a tracking link by email. | A shipment record is created with carrier and tracking number. Status history is recorded. |
| 6. Out for delivery, then delivered | The status updates. | The delivery date is recorded and the return window starts. |

**Cash on delivery** is the same, except:
- you **confirm** the order after speaking to the customer, and that is when stock is taken;
- the payment becomes **Paid** when you press **تم التوصيل** (Delivered).

If a card payment never arrives, the order is cancelled automatically after the hold time
and the piece goes back on sale.

Every step is in the order's history and in **سجل العمليات** (Audit log), with who did what and when.

---

## 11. VAT and ZATCA

Keep two things separate:

**What the software does**
- Calculates 15% VAT (configurable) on the server for every order, on goods and optionally on shipping.
- Shows the VAT share in the bag, at checkout, on emails and on the invoice.
- Shows your VAT number and commercial registration on the invoice once entered in Settings.
  With a VAT number, the invoice is titled "فاتورة ضريبية مبسطة" (Simplified tax invoice).
- The customer, and now you, can open and print each order's invoice. From the back office:
  order → **الفاتورة** (Invoice).

**What the software does not do**
- It does **not** produce ZATCA e-invoices (FATOORA): no ZATCA QR code, no XML, no
  connection to ZATCA. The invoice states this in its footer.
- It does **not** file VAT returns.

**What you should check with your accountant or ZATCA (zatca.gov.sa)**
- Whether you must register for VAT. ZATCA publishes the registration thresholds.
- Whether, and from when, the e-invoicing rules apply to you. If they do, you will need a
  ZATCA-compliant e-invoicing solution connected to this store, which would need further
  development work.
- Whether showing prices including VAT is required for your sales.

---

## 12. Environments

| Environment | Address | Purpose | Money |
| --- | --- | --- | --- |
| Development | a developer's computer | Building and testing | None (simulated) |
| Staging | for example `staging.your-domain` | Trying changes and Moyasar **test** payments before customers see them. Hidden from Google. | None (Moyasar test keys) |
| Production | `your-domain` | The real shop | Real (Moyasar live keys) |

Each environment has its **own database**. Never point staging at the production database.

---

## 13. Settings the developer enters in the hosting company — Developer

These are entered in the hosting dashboard (Vercel → Settings → Environment Variables),
**never** in the code, and **never** sent by chat or email. Values marked secret must be
long and random. The full annotated list is in `.env.example`.

| Name | What it is | Secret? |
| --- | --- | --- |
| `APP_ENV` | `production` (or `staging`) | no |
| `NEXT_PUBLIC_APP_URL` | Your address, for example `https://velora.sa` | no |
| `TRUST_PROXY_HEADERS` | `true` on Vercel | no |
| `DATABASE_URL` | Database connection (the pooled one) | **yes** |
| `DATABASE_POOL_MAX` | 5–10 on Vercel | no |
| `AUTH_SECRET` | Protects sign-in sessions. Changing it signs everyone out. | **yes** |
| `CRON_SECRET` | Protects the automatic jobs | **yes** |
| `PAYMENT_PROVIDER` | `moyasar` | no |
| `MOYASAR_PUBLISHABLE_KEY` | Moyasar public key | no |
| `MOYASAR_SECRET_KEY` | Moyasar secret key | **yes** |
| `MOYASAR_WEBHOOK_SECRET` | Shared with the Moyasar webhook | **yes** |
| `SHIPPING_PROVIDER` | `manual` | no |
| `EMAIL_PROVIDER` | `resend` | no |
| `RESEND_API_KEY` | Resend key | **yes** |
| `EMAIL_FROM` | Sender, for example `VÉLORA <orders@velora.sa>` | no |
| `STORAGE_PROVIDER` | `s3` | no |
| `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT` | Photo storage location | no |
| `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Photo storage keys | **yes** |
| `STORAGE_PUBLIC_BASE_URL` | Public address of the photos | no |
| `RATE_LIMIT_PROVIDER` | `postgres` | no |
| `ANALYTICS_PROVIDER`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional Google Analytics | no |
| `SMS_PROVIDER`, `WHATSAPP_PROVIDER` | `none` (not connected) | no |
| `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION` | Must be `false` (or absent) in production | no |

The production server **refuses to start** if something unsafe is configured: no HTTPS,
no job secret, simulated payments, local photo storage, or test-only rate limiting.

---

## 14. Costs checklist

None of these are bought by this project. **Verify current pricing** for each before deciding.

| Item | Needed? | What determines the cost |
| --- | --- | --- |
| Domain (`.sa` and/or `.com`) | Yes | Extension, registrar, years |
| Hosting (Vercel or other) | Yes | Plan (scheduled jobs need more than the free tier), traffic |
| PostgreSQL database | Yes | Size, backups / point-in-time recovery, region |
| Photo storage (R2 / S3) | Yes | Storage and traffic |
| Moyasar | Yes, for card payments | Per-transaction fees by method; your contract |
| Courier (SPL / SMSA / Aramex …) | Yes | Your contract: zones, weight, volume, cash-on-delivery handling |
| Resend (sending email) | Yes | Monthly email volume |
| Mailbox for `orders@your-domain` | Yes | Your email provider's plan |
| Uptime monitoring | Recommended | Plan |
| Error tracking (for example Sentry) | Optional | Plan and volume |
| SMS / WhatsApp provider | Optional, not built | Per message; development needed |
| ZATCA e-invoicing solution | If it applies to you | Solution and integration work |
| Accountant / legal adviser | Recommended | Their fees |

---

## 15. Launch checklist

**Accounts and legal**
- [ ] Commercial registration and VAT status confirmed with your accountant
- [ ] Moyasar account approved (documents submitted)
- [ ] Courier business account(s) opened
- [ ] Privacy, terms, returns and shipping pages reviewed (Pages section), legal advice taken where needed

**Developer set-up**
- [ ] Domain bought and connected; HTTPS active
- [ ] Production database created with backups and point-in-time recovery
- [ ] Photo storage bucket created
- [ ] Environment variables entered (section 13); `APP_ENV=production`
- [ ] Database set up with reference data only (no demo data)
- [ ] **Your** administrator account created; test accounts suspended
- [ ] Resend domain verified; a test email reaches your inbox
- [ ] Scheduled jobs running (hosting plan or external scheduler)
- [ ] Uptime monitor watching `https://your-domain/api/health`
- [ ] Smoke test passed: `npm run smoke -- https://your-domain`

**In the back office**
- [ ] All Settings sections filled with real values (section 6)
- [ ] Products added with photos, prices, stock, and published
- [ ] Staff invited with the right permissions
- [ ] The yellow "test mode" bar is gone

**Rehearsal on staging, with Moyasar test keys**
- [ ] Customer: sign up → browse → bag → checkout → pay (test card) → confirmation email
- [ ] You: new-order email arrives → confirm → prepare → ship with tracking → deliver
- [ ] Customer: sees "Delivered" → requests a return → you approve, receive and complete it → refund appears in Moyasar
- [ ] Declined test card → order cancelled, stock back
- [ ] Cash-on-delivery order end to end

**Launch day**
- [ ] Live Moyasar keys in production
- [ ] One small real order by you → refund it → both visible in Moyasar
- [ ] Announce

---

## 16. Recommended launch sequence

1. **Business**: commercial registration, VAT status, bank account.
2. **Accounts**: Moyasar application (it takes time), courier account, domain.
3. **Infrastructure** (developer): database, storage, hosting, email domain verification.
4. **Staging**: deploy, connect Moyasar **test** keys, run the whole rehearsal (section 15).
5. **Content**: settings, pages, products and photos, entered on production as soon as it exists
   (the shop can stay unannounced).
6. **Production**: live keys, one real order and refund, then open to the public.
7. **First weeks**: check the dashboard's "بانتظار الفريق" panel and the notifications log daily;
   reconcile Moyasar payouts with **paid** orders weekly.

---

## 17. When something looks wrong

| You notice | Do this |
| --- | --- |
| A customer paid but the order says "Awaiting payment" | Wait a few minutes: the payment company confirms in the background. If it persists, tell the developer, who checks the Moyasar webhook. Do **not** mark it paid by hand: there is no such button, on purpose. |
| Customers say they got no email | **سجل الإشعارات** (Notifications log): each email shows its status and error. Press retry. If everything says "simulated", email is not connected yet. |
| Stock looks wrong | Inventory → the option → **سجل الحركات** shows every movement and who made it. Correct it with a **جرد** (Count) and a reason. |
| A product does not appear | It must be **Published**, with a photo, an active option, and stock above 0 to be buyable. |
| Someone may know your password | Change it (2.3). Check **سجل العمليات** (Audit log) for anything you did not do. |
| The site is down | The developer checks `https://your-domain/api/health` and the hosting logs. Day-to-day technical procedures are in `docs/operations.md`. |
