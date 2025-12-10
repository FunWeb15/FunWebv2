document.addEventListener("DOMContentLoaded", () => {

  emailjs.init("UjiGSekzpgTWMon5i"); // ✅ Your Public Key

  const quizData = [
    {q:"Which of the following BEST describes motion?",o:["A change in the color of an object","A change in the position of an object over time","An object staying still","A force acting downward"],a:1,e:"Motion is a change in position over time."},
    {q:"A toy car travels 20 meters in 4 seconds. What is its speed?",o:["2 m/s","4 m/s","5 m/s","8 m/s"],a:2,e:"Speed = Distance ÷ Time → 20 ÷ 4 = 5 m/s"},
    {q:"When distance increases but time stays the same, what happens to speed?",o:["Speed decreases","Speed increases","Speed does not change","Speed becomes zero"],a:1,e:"More distance in same time means higher speed."},
    {q:"What is needed to change motion?",o:["Mass","Shape","Force","Temperature"],a:2,e:"A force is required to change motion."},
    {q:"Equal and opposite forces are called?",o:["Net","Balanced","Unbalanced","Friction"],a:1,e:"Balanced forces cancel each other."},
    {q:"What happens with unbalanced forces?",o:["Stops","No change","Motion changes","Lighter"],a:2,e:"Unbalanced forces change motion."},
    {q:"When temperature increases, particles?",o:["Stop","Slow","Move faster","Grow"],a:2,e:"Heat increases particle motion."},
    {q:"Which has particles closest?",o:["Solid","Liquid","Gas","Plasma"],a:0,e:"Solids have tightly packed particles."},
    {q:"Why do gases fill containers?",o:["Still","Packed","Move freely","Vibrate"],a:2,e:"Gas particles move freely and far apart."},
    {q:"Book on table doesn't move because?",o:["No gravity","Balanced forces","Table moves","Small particles"],a:1,e:"Upward table force balances gravity."}
  ];

  let index = 0;
  let answers = [];

  // ✅ TIME TRACKING VARIABLES
  let quizStartTime = null;
  let quizEndTime = null;

  const title = document.getElementById("questionTitle");
  const body = document.getElementById("questionBody");
  const options = document.getElementById("optionsContainer");
  const feedback = document.getElementById("feedback");
  const next = document.getElementById("nextBtn");
  const prev = document.getElementById("prevBtn");
  const start = document.getElementById("startBtn");

  const quizCard = document.getElementById("quizCard");
  const resultsCard = document.getElementById("resultsCard");
  const resultsTable = document.getElementById("resultsTable");
  const scoreNumber = document.getElementById("scoreNumber");
  const scorePercent = document.getElementById("scorePercent");

  const studentNameInput = document.getElementById("studentName");
  const studentSectionInput = document.getElementById("studentSection");

  // ✅ BLOCK START IF NO NAME + RECORD START TIME
  start.onclick = () => {
    if (!studentNameInput.value.trim() || !studentSectionInput.value.trim()) {
      alert("Please enter your Name and Section first.");
      return;
    }

    // ✅ RECORD START TIME
    quizStartTime = new Date();

    document.getElementById("studentForm").style.display = "none";
    load();
  };

  function load() {
    const q = quizData[index];
    title.textContent = `Question ${index + 1}`;
    body.textContent = q.q;
    options.innerHTML = "";
    feedback.textContent = "";

    q.o.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn";
      btn.textContent = opt;

      btn.onclick = () => {
        answers[index] = i;
        feedback.textContent = i === q.a ? "✅ Correct! " + q.e : "❌ Incorrect. " + q.e;
        document.querySelectorAll(".opt-btn").forEach(b => b.disabled = true);
        next.disabled = false;
      };

      options.appendChild(btn);
    });

    next.disabled = true;
    prev.disabled = index === 0;
  }

  next.onclick = () => {
    if (index < quizData.length - 1) {
      index++;
      load();
    } else {
      showResults();
    }
  };

  prev.onclick = () => {
    if (index > 0) {
      index--;
      load();
    }
  };

  // ✅ ✅ ✅ RESULTS + GMAIL AUTO SEND + TIME RECORDING
  function showResults() {
    quizCard.style.display = "none";
    resultsCard.style.display = "block";

    // ✅ RECORD END TIME
    quizEndTime = new Date();

    const totalSeconds = Math.floor((quizEndTime - quizStartTime) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeTaken = `${minutes} min ${seconds} sec`;

    let score = 0;
    let fullAnswers = "";

    resultsTable.innerHTML = `
      <tr>
        <th>#</th>
        <th>Question</th>
        <th>Your Answer</th>
        <th>Correct Answer</th>
      </tr>
    `;

    quizData.forEach((q, i) => {
      if (answers[i] === q.a) score++;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${q.q}</td>
        <td>${q.o[answers[i]] || "—"}</td>
        <td>${q.o[q.a]}</td>
      `;
      resultsTable.appendChild(row);

      fullAnswers += `Q${i + 1}: ${q.o[answers[i]] || "—"} | Correct: ${q.o[q.a]}\n`;
    });

    let percent = Math.round((score / quizData.length) * 100);

    scoreNumber.textContent = `${score} / ${quizData.length}`;
    scorePercent.textContent = `${percent}%`;

    // ✅ SEND TO GMAIL WITH NAME, SECTION & TIME
    emailjs.send(
      "service_fs7ckk8",
      "template_8ftekev",
      {
        name: studentNameInput.value,
        section: studentSectionInput.value,
        score: score,
        percent: percent,
        answers: fullAnswers,
        start_time: quizStartTime.toLocaleString(),
        end_time: quizEndTime.toLocaleString(),
        time_taken: timeTaken,
        date: new Date().toLocaleString()
      }
    ).then(
      () => console.log("✅ Results + Time sent to Gmail"),
      (err) => console.error("❌ Email failed:", err)
    );
  }

});
