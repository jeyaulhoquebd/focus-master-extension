# 🎯 ফোকাস মাস্টার — Chrome Extension

[![Focus Master Demo](https://img.youtube.com/vi/6zfxeBBYTxo/maxresdefault.jpg)](https://www.youtube.com/watch?v=6zfxeBBYTxo)
 
## ইনস্টল করার নিয়ম

1. `focus-master-extension` ফোল্ডারটি ডাউনলোড করুন।
2. Chrome ব্রাউজার খুলুন → `chrome://extensions/` লিখুন।
3. উপরের ডানদিকে **Developer mode** চালু করুন।
4. **Load unpacked** বাটনে ক্লিক করুন।
5. `focus-master-extension` ফোল্ডার সিলেক্ট করুন।
6. টুলবারে 🎯 আইকন দেখতে পাবেন — ক্লিক করুন!

## ফিচার

- ⏱️ **Pomodoro টাইমার** — ২৫/৫, ৩০/৫, ৫০/১০ প্রিসেট
- 🎯 **দৈনিক লক্ষ্য** — নির্দিষ্ট, পরিমাপযোগ্য
- 🗒️ **Distraction List** — চিন্তা লিখে রেখে কাজে ফিরে যান
- 🚫 **সাইট ব্লকার** — Facebook, YouTube, Instagram ইত্যাদি ব্লক
- 📋 **৮টি অভ্যাসের চেকলিস্ট** — প্রতিদিনের অগ্রগতি
- 😴 **ঘুম ক্যালকুলেটর** — কখন ঘুমাতে হবে
- 📊 **সাপ্তাহিক স্ট্যাটস**
- 🌙 **Dark / Light থিম**

## আইকন যোগ করা (Optional)

`icons/` ফোল্ডার বানিয়ে `icon16.png`, `icon48.png`, `icon128.png` রাখুন।
তারপর `manifest.json`-এ যোগ করুন:

```json
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
},
"action": {
  "default_popup": "popup.html",
  "default_icon": "icons/icon48.png"
}

