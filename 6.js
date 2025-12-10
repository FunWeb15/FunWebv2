document.addEventListener("DOMContentLoaded", () => {

  emailjs.init("UjiGSekzpgTWMon5i"); // ✅ Your Public Key

  const quizData = [
  {
    q: "Which of the following best describes motion?",
    o: [
      "A change in direction only",
      "A change in speed only",
      "A change in position relative to a reference point",
      "Staying in the same place over time"
    ],
    a: 2,
    e: "Motion means an object changes its position relative to a reference point."
  },
  {
    q: "Which situation shows that an object is in motion?",
    o: [
      "A parked car beside a tree",
      "A book sitting on a table",
      "A student walking past a stationary pole",
      "A chair in the classroom"
    ],
    a: 2,
    e: "The walking student changes position relative to the pole, showing motion."
  },
  {
    q: "What two quantities are needed to determine speed?",
    o: [
      "Mass and time",
      "Distance and time",
      "Force and distance",
      "Distance and direction"
    ],
    a: 1,
    e: "Speed is calculated using distance divided by time."
  },
  {
    q: "A runner travels the same distance every second. This means the runner is moving with…",
    o: [
      "Speeding up",
      "Slowing down",
      "Constant speed",
      "Changing direction"
    ],
    a: 2,
    e: "Equal distance per second means constant speed."
  },
  {
    q: "If an object covers a greater distance in less time, what can we say about its speed?",
    o: [
      "It decreases",
      "It increases",
      "It becomes zero",
      "It stays the same"
    ],
    a: 1,
    e: "More distance in less time means the speed increases."
  },
  {
    q: "Which graph represents constant speed?",
    o: [
      "A horizontal line",
      "A slanted straight line upward",
      "A curved line upward",
      "A zigzag line"
    ],
    a: 1,
    e: "A straight, slanted line shows constant speed because distance increases at a steady rate."
  },
  {
    q: "A car that has a steeper line on a distance-time graph is…",
    o: [
      "Slower",
      "Faster",
      "Not moving",
      "Moving backward"
    ],
    a: 1,
    e: "A steeper line means the distance increases faster, so the speed is higher."
  },
  {
    q: "Which of the following situations shows changing speed?",
    o: [
      "A jeepney cruising steadily on a highway",
      "A tricycle stopped at a red light",
      "A motorcycle slowing down before a turn",
      "A person sitting in a classroom"
    ],
    a: 2,
    e: "Slowing down or speeding up means the speed is changing."
  },
  {
    q: "A bicycle moves 10 meters every second. What does this tell us?",
    o: [
      "Its speed is changing",
      "It moves with constant speed",
      "It is not moving",
      "It moves only for one second"
    ],
    a: 1,
    e: "Covering equal distance per second means constant speed."
  },
  {
    q: "Which statement best explains why a reference point is important?",
    o: [
      "It measures force",
      "It helps determine the direction of gravity",
      "It shows whether an object has mass",
      "It helps us know if an object is moving"
    ],
    a: 3,
    e: "Motion can only be observed when compared to a reference point."
  }
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
