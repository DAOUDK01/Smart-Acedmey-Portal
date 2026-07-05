(async () => {
  try {
    const now = Date.now();
    const payload = {
      code: `TEST-${now}`,
      title: `API Test Course ${now}`,
      description: "Created by smoke test",
      level: "Beginner",
      isPublished: false,
      sortOrder: 99,
      // Some backend validations expect teacherId to be present (can be empty)
      teacherId: "",
    };

    const res = await fetch("http://localhost:3001/api/admin/courses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log("STATUS", res.status);
    console.log(text);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
