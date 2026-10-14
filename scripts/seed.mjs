// Usage (dev server must be running):  node scripts/seed.mjs K9HQGK
const code = process.argv[2];
const base = process.env.BASE_URL ?? "http://localhost:3000";
if (!code) {
  console.error("Usage: node scripts/seed.mjs <CLASS_CODE>");
  process.exit(1);
}

// 5 topics (Flask lecture), each worded differently on purpose
const doubts = [
  // Routing
  "I don't understand how @app.route maps a URL to a function",
  "How does Flask know which function to run for a given URL?",
  "What does the route decorator actually do?",
  "Why do we write @app.route above the function? It's confusing",
  "How are URLs connected to Python functions in Flask?",
  // GET vs POST and form data
  "What's the difference between GET and POST in Flask routes?",
  "When should I use methods=['POST'] on a route?",
  "How do I read the data a user submits in a form?",
  "request.form vs request.args, which one should I use?",
  // Templates
  "How does render_template pass variables into the HTML?",
  "What are the {{ }} curly braces in the html file?",
  "Jinja templates confuse me, how do variables get into the page?",
  "Where should I keep the html files in a Flask project?",
  // Virtual environments
  "What is a virtual environment and why do we need one?",
  "Why do I need venv before installing Flask?",
  "pip install installs globally, so how is venv different?",
  // Debug mode / running the app
  "What does debug=True do when running the app?",
  "Why does the server restart by itself when I change my code?",
  "Is it safe to leave debug mode on in production?",
  "How do I run the app, flask run or python app.py?",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const classRes = await fetch(`${base}/api/class?code=${code}`);
if (!classRes.ok) {
  console.error("Class lookup failed:", classRes.status, await classRes.text());
  process.exit(1);
}
const cls = await classRes.json();
const lecture = cls.lectures[0];
if (!lecture) {
  console.error("This class has no lectures yet. Add one on the dashboard first.");
  process.exit(1);
}
console.log(`Seeding "${lecture.title}" in "${cls.name}"...`);

for (const [i, text] of doubts.entries()) {
  const res = await fetch(`${base}/api/doubts/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      lectureId: lecture.id,
      text,
      sessionId: `seed-session-${i}-${Date.now()}`, // each doubt looks like a different student
    }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`${i + 1}/${doubts.length} ${res.ok ? "ok" : "FAILED " + (body.error ?? res.status)}  ${text.slice(0, 50)}`);
  await sleep(1500); // stay under the rate limit
}
console.log("Done. Check the dev server terminal for the [cluster] similarity lines.");