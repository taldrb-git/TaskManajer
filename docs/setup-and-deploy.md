# התקנה, הרצה ופריסה

## דרישות

- Node.js 22 ומעלה
- חשבון GitHub (לפריסה, חינם)
- חשבון Supabase (רק אם רוצים סנכרון בין מכשירים, חינם)

## הרצה מקומית

```bash
cd C:\Users\tal\Desktop\task-manager
npm install          # פעם ראשונה בלבד
npm run dev
```

- **במחשב:** http://localhost:5173
- **בטלפון באותה רשת Wi-Fi:** הכתובת שמופיעה בטרמינל בשורה `Network`. ייתכן שחומת האש של Windows או רשת של מקום עבודה יחסמו אותה.
  בכתובת כזו אפשר להשתמש באפליקציה, אבל אי אפשר להתקין אותה. התקנה דורשת HTTPS, כלומר פריסה.

### פקודות

| פקודה | מה היא עושה |
|---|---|
| `npm run dev` | שרת פיתוח עם רענון אוטומטי |
| `npm run build` | בדיקת טיפוסים ובניית גרסת ייצור לתיקייה `dist` |
| `npm run preview` | הרצת גרסת הייצור מקומית, כולל service worker, לבדיקת PWA |
| `npm run lint` | בדיקת קוד (oxlint) |

## סנכרון בין מכשירים: Supabase

1. נרשמים ב-<https://supabase.com> ופותחים **New project**. כדאי לבחור אזור קרוב, למשל Frankfurt.
2. נכנסים ל-**SQL Editor**, פותחים **New query**, מדביקים את כל התוכן של [supabase/schema.sql](../supabase/schema.sql) ולוחצים **Run**.
   אפשר להריץ את הקובץ שוב בלי נזק. **אחרי עדכון גרסה** שמשנה את מבנה הנתונים (מצוין ב-CHANGELOG תחת "מסד נתונים") מריצים אותו שוב.
3. ב-**Project Settings → API** מעתיקים את **Project URL** ואת המפתח **anon public**.
4. יוצרים קובץ `.env.local` בתיקיית הפרויקט (לפי הדוגמה ב-[.env.example](../.env.example)):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. ב-**Authentication → URL Configuration** מכניסים ל-**Site URL** את כתובת האתר אחרי הפריסה.
   הקישור במייל אישור ההרשמה מוביל לכתובת הזו.
6. מפעילים מחדש את `npm run dev`, ואז ב**הגדרות** בוחרים **יצירת חשבון**.

**אבטחה:** המפתח `anon` ציבורי מטבעו, ומותר שיופיע בקוד של האתר.
את הגישה לנתונים מגבילים כללי Row Level Security (RLS) במסד הנתונים: כל משתמש רואה ומשנה רק את הנתונים שלו.
את המפתח `service_role` אסור לשים באפליקציה.

**מגבלות התוכנית החינמית:**
- Supabase משהה פרויקט אחרי שבוע בלי שימוש. כדי להחזיר אותו לוחצים **Restore** בדשבורד. הנתונים לא נמחקים.
- גם כשהפרויקט מושהה, האפליקציה ממשיכה לעבוד מהמכשיר ומסנכרנת כשהוא חוזר.

## פריסה ל-GitHub Pages

1. יוצרים repository ב-GitHub (למשל `task-manager`) ומעלים את הקוד:
   ```bash
   git init && git add . && git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/USERNAME/task-manager.git
   git push -u origin main
   ```
2. ב-repository נכנסים ל-**Settings → Pages** ובוחרים ב-**Source** את **GitHub Actions**.
3. אם משתמשים ב-Supabase, מוסיפים ב-**Settings → Secrets and variables → Actions** שני secrets:
   `VITE_SUPABASE_URL` ו-`VITE_SUPABASE_ANON_KEY`.
4. מעכשיו כל push ל-`main` מפרסם את האתר אוטומטית (ההגדרה בקובץ [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)).
   הכתובת תהיה `https://USERNAME.github.io/task-manager/`

**חלופות:** אפשר לחבר את ה-repository ל-Cloudflare Pages או ל-Netlify, עם פקודת בנייה `npm run build` ותיקיית פלט `dist`.
את משתני `VITE_...` מגדירים בהגדרות הפרויקט באותו שירות.

## התקנה על המכשיר

| מכשיר | איך מתקינים |
|---|---|
| אנדרואיד (Chrome) | תפריט ⋮, ואז **התקנת אפליקציה**. או בתוך האפליקציה: **הגדרות → התקנה על המכשיר** |
| אייפון (Safari) | כפתור שיתוף, ואז **הוספה למסך הבית** |
| מחשב (Chrome / Edge) | אייקון ההתקנה בשורת הכתובת |

**עדכונים:** כשמתפרסמת גרסה חדשה, היא נטענת ברקע ונכנסת לתוקף בפתיחה הבאה של האפליקציה.

## פתרון בעיות

| בעיה | פתרון |
|---|---|
| אין בהגדרות טופס התחברות | `.env.local` חסר או שגוי. אחרי שמתקנים אותו מפעילים מחדש את `npm run dev`. בפריסה, בודקים את ה-secrets ב-GitHub |
| "שגיאת סנכרון" | בודקים שהקובץ `schema.sql` הורץ, כולל אחרי עדכון גרסה, ושהפרויקט ב-Supabase לא מושהה |
| תזכורות לא מופיעות | בודקים שההתראות מותרות לאתר בהגדרות הדפדפן ושהאפליקציה פתוחה. כרגע אין תזכורות כשהיא סגורה |
| "צריך לאשר את כתובת הדוא"ל" | לוחצים על הקישור במייל מ-Supabase, ואז מתחברים |
| אחרי פריסה עדיין מוצגת הגרסה הישנה | סוגרים את האפליקציה ופותחים שוב (פעם או פעמיים) |
| הטלפון לא נכנס לכתובת `Network` | חומת אש או רשת ארגונית. פורסים ל-GitHub Pages |
