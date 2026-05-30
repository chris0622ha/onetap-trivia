"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";

const QUESTIONS = [
  // Geography
  { q: "What is the capital of France?", a: "Paris", wrong: ["Lyon", "Marseille", "Bordeaux"] },
  { q: "What is the capital of Japan?", a: "Tokyo", wrong: ["Osaka", "Kyoto", "Hiroshima"] },
  { q: "What is the capital of Australia?", a: "Canberra", wrong: ["Sydney", "Melbourne", "Brisbane"] },
  { q: "What is the capital of Brazil?", a: "Brasilia", wrong: ["Sao Paulo", "Rio de Janeiro", "Salvador"] },
  { q: "What is the capital of Canada?", a: "Ottawa", wrong: ["Toronto", "Vancouver", "Montreal"] },
  { q: "What is the capital of Egypt?", a: "Cairo", wrong: ["Alexandria", "Luxor", "Aswan"] },
  { q: "What is the capital of South Africa?", a: "Pretoria", wrong: ["Cape Town", "Johannesburg", "Durban"] },
  { q: "What is the capital of Argentina?", a: "Buenos Aires", wrong: ["Cordoba", "Rosario", "Mendoza"] },
  { q: "What is the capital of India?", a: "New Delhi", wrong: ["Mumbai", "Kolkata", "Chennai"] },
  { q: "What is the capital of China?", a: "Beijing", wrong: ["Shanghai", "Guangzhou", "Shenzhen"] },
  { q: "What is the capital of Russia?", a: "Moscow", wrong: ["St. Petersburg", "Novosibirsk", "Kazan"] },
  { q: "What is the capital of Germany?", a: "Berlin", wrong: ["Munich", "Hamburg", "Frankfurt"] },
  { q: "What is the capital of Italy?", a: "Rome", wrong: ["Milan", "Naples", "Venice"] },
  { q: "What is the capital of Spain?", a: "Madrid", wrong: ["Barcelona", "Seville", "Valencia"] },
  { q: "What is the capital of Mexico?", a: "Mexico City", wrong: ["Guadalajara", "Monterrey", "Cancun"] },
  { q: "What is the largest country by area?", a: "Russia", wrong: ["Canada", "USA", "China"] },
  { q: "What is the smallest country in the world?", a: "Vatican City", wrong: ["Monaco", "San Marino", "Liechtenstein"] },
  { q: "Which country has the most natural lakes?", a: "Canada", wrong: ["Russia", "USA", "Finland"] },
  { q: "What is the longest river in the world?", a: "Nile", wrong: ["Amazon", "Yangtze", "Mississippi"] },
  { q: "What is the largest ocean on Earth?", a: "Pacific", wrong: ["Atlantic", "Indian", "Arctic"] },
  { q: "What is the largest continent?", a: "Asia", wrong: ["Africa", "North America", "Europe"] },
  { q: "Which country has the longest coastline?", a: "Canada", wrong: ["Russia", "Norway", "Indonesia"] },
  { q: "What is the tallest mountain in the world?", a: "Mount Everest", wrong: ["K2", "Kangchenjunga", "Makalu"] },
  { q: "What is the largest desert in the world?", a: "Antarctic Desert", wrong: ["Sahara", "Arabian", "Gobi"] },
  { q: "What is the deepest lake in the world?", a: "Lake Baikal", wrong: ["Caspian Sea", "Lake Superior", "Lake Tanganyika"] },
  { q: "Which continent has the most countries?", a: "Africa", wrong: ["Asia", "Europe", "Americas"] },
  { q: "What is the capital of Turkey?", a: "Ankara", wrong: ["Istanbul", "Izmir", "Bursa"] },
  { q: "What is the capital of South Korea?", a: "Seoul", wrong: ["Busan", "Incheon", "Daegu"] },
  { q: "What is the capital of Thailand?", a: "Bangkok", wrong: ["Chiang Mai", "Phuket", "Pattaya"] },
  { q: "What is the capital of Portugal?", a: "Lisbon", wrong: ["Porto", "Braga", "Coimbra"] },

  // Science
  { q: "What is the chemical symbol for gold?", a: "Au", wrong: ["Go", "Gd", "Ag"] },
  { q: "What is the chemical symbol for silver?", a: "Ag", wrong: ["Si", "Sv", "Sl"] },
  { q: "What is the chemical symbol for iron?", a: "Fe", wrong: ["Ir", "In", "Im"] },
  { q: "What is the chemical symbol for sodium?", a: "Na", wrong: ["So", "Sd", "Sm"] },
  { q: "What is the chemical symbol for potassium?", a: "K", wrong: ["Po", "Pt", "Pm"] },
  { q: "What element has atomic number 1?", a: "Hydrogen", wrong: ["Helium", "Lithium", "Carbon"] },
  { q: "What is the most abundant gas in Earth's atmosphere?", a: "Nitrogen", wrong: ["Oxygen", "Carbon Dioxide", "Argon"] },
  { q: "How many bones are in the adult human body?", a: "206", wrong: ["198", "215", "230"] },
  { q: "What gas do plants absorb from the air?", a: "CO2", wrong: ["O2", "N2", "H2"] },
  { q: "What is the speed of light?", a: "300,000 km/s", wrong: ["150,000 km/s", "450,000 km/s", "200,000 km/s"] },
  { q: "What planet is closest to the Sun?", a: "Mercury", wrong: ["Venus", "Mars", "Earth"] },
  { q: "What is the largest planet in our solar system?", a: "Jupiter", wrong: ["Saturn", "Neptune", "Uranus"] },
  { q: "How many planets are in our solar system?", a: "8", wrong: ["7", "9", "10"] },
  { q: "Which planet has the most moons?", a: "Saturn", wrong: ["Jupiter", "Uranus", "Neptune"] },
  { q: "What is the closest star to Earth?", a: "The Sun", wrong: ["Proxima Centauri", "Alpha Centauri", "Sirius"] },
  { q: "What is the hardest natural substance?", a: "Diamond", wrong: ["Quartz", "Corundum", "Graphene"] },
  { q: "What force keeps planets in orbit?", a: "Gravity", wrong: ["Magnetism", "Friction", "Centrifugal force"] },
  { q: "What is the powerhouse of the cell?", a: "Mitochondria", wrong: ["Nucleus", "Ribosome", "Chloroplast"] },
  { q: "What is the most abundant element in the universe?", a: "Hydrogen", wrong: ["Helium", "Oxygen", "Carbon"] },
  { q: "What is the process by which plants make food?", a: "Photosynthesis", wrong: ["Respiration", "Osmosis", "Fermentation"] },
  { q: "What is the unit of electrical resistance?", a: "Ohm", wrong: ["Volt", "Amp", "Watt"] },
  { q: "How many chambers does the human heart have?", a: "4", wrong: ["2", "3", "6"] },
  { q: "What is the boiling point of water in Celsius?", a: "100", wrong: ["90", "110", "212"] },
  { q: "What is DNA short for?", a: "Deoxyribonucleic acid", wrong: ["Dioxynucleic acid", "Dinucleic acid", "Dextronucleic acid"] },
  { q: "How many teeth does an adult human have?", a: "32", wrong: ["28", "30", "34"] },
  { q: "What is the largest organ in the human body?", a: "Skin", wrong: ["Liver", "Brain", "Lungs"] },
  { q: "What type of blood type is the universal donor?", a: "O negative", wrong: ["A positive", "B negative", "AB positive"] },
  { q: "How long does it take light to travel from Sun to Earth?", a: "8 minutes", wrong: ["3 minutes", "15 minutes", "1 hour"] },
  { q: "What is the atomic number of carbon?", a: "6", wrong: ["8", "12", "4"] },
  { q: "What gas makes up about 21% of Earth's atmosphere?", a: "Oxygen", wrong: ["Nitrogen", "Carbon dioxide", "Argon"] },

  // Math
  { q: "What is the square root of 144?", a: "12", wrong: ["11", "13", "14"] },
  { q: "What is the square root of 256?", a: "16", wrong: ["14", "18", "15"] },
  { q: "What is 15% of 200?", a: "30", wrong: ["25", "35", "40"] },
  { q: "How many sides does a hexagon have?", a: "6", wrong: ["5", "7", "8"] },
  { q: "How many sides does an octagon have?", a: "8", wrong: ["6", "7", "9"] },
  { q: "How many hours are in a week?", a: "168", wrong: ["144", "196", "172"] },
  { q: "What is pi rounded to 2 decimal places?", a: "3.14", wrong: ["3.12", "3.16", "3.41"] },
  { q: "What is 2 to the power of 10?", a: "1024", wrong: ["512", "2048", "1000"] },
  { q: "What is the sum of angles in a triangle?", a: "180 degrees", wrong: ["90 degrees", "270 degrees", "360 degrees"] },
  { q: "What is the sum of angles in a quadrilateral?", a: "360 degrees", wrong: ["180 degrees", "270 degrees", "540 degrees"] },
  { q: "What is 12 x 13?", a: "156", wrong: ["144", "169", "148"] },
  { q: "What is 7 x 8?", a: "56", wrong: ["54", "58", "63"] },
  { q: "What is 17 x 17?", a: "289", wrong: ["279", "299", "256"] },
  { q: "What number is a dozen?", a: "12", wrong: ["10", "14", "20"] },
  { q: "What is a score (as in Gettysburg Address)?", a: "20", wrong: ["10", "12", "50"] },
  { q: "What is the next prime after 7?", a: "11", wrong: ["9", "10", "13"] },
  { q: "How many zeroes in a million?", a: "6", wrong: ["5", "7", "9"] },
  { q: "How many degrees in a full circle?", a: "360", wrong: ["180", "270", "400"] },
  { q: "What is 25% of 80?", a: "20", wrong: ["15", "25", "30"] },
  { q: "What is the Roman numeral for 50?", a: "L", wrong: ["C", "V", "X"] },

  // History
  { q: "In what year did World War II end?", a: "1945", wrong: ["1943", "1944", "1946"] },
  { q: "In what year did World War I begin?", a: "1914", wrong: ["1912", "1916", "1918"] },
  { q: "Who was the first US President?", a: "George Washington", wrong: ["Abraham Lincoln", "Thomas Jefferson", "John Adams"] },
  { q: "In what year did the Berlin Wall fall?", a: "1989", wrong: ["1987", "1991", "1985"] },
  { q: "Who wrote the Declaration of Independence?", a: "Thomas Jefferson", wrong: ["Benjamin Franklin", "John Adams", "George Washington"] },
  { q: "In what year did man first land on the Moon?", a: "1969", wrong: ["1965", "1971", "1967"] },
  { q: "Who was the first person to walk on the Moon?", a: "Neil Armstrong", wrong: ["Buzz Aldrin", "Yuri Gagarin", "John Glenn"] },
  { q: "What ancient wonder was in Alexandria?", a: "Lighthouse", wrong: ["Library", "Colossus", "Pyramid"] },
  { q: "Who was the first woman to win a Nobel Prize?", a: "Marie Curie", wrong: ["Rosalind Franklin", "Lise Meitner", "Dorothy Hodgkin"] },
  { q: "In what year did the Titanic sink?", a: "1912", wrong: ["1910", "1914", "1908"] },
  { q: "Which empire was ruled by Julius Caesar?", a: "Roman", wrong: ["Greek", "Ottoman", "Persian"] },
  { q: "Who invented the printing press?", a: "Gutenberg", wrong: ["Edison", "Watt", "Bell"] },
  { q: "In what year did the French Revolution begin?", a: "1789", wrong: ["1776", "1799", "1815"] },
  { q: "Who was the first female US Secretary of State?", a: "Madeleine Albright", wrong: ["Hillary Clinton", "Condoleezza Rice", "Janet Reno"] },
  { q: "What was the name of the first artificial satellite?", a: "Sputnik", wrong: ["Explorer", "Vanguard", "Echo"] },
  { q: "In what year did the Soviet Union dissolve?", a: "1991", wrong: ["1989", "1993", "1987"] },
  { q: "Who painted the Mona Lisa?", a: "Leonardo da Vinci", wrong: ["Michelangelo", "Raphael", "Botticelli"] },
  { q: "Who wrote Romeo and Juliet?", a: "Shakespeare", wrong: ["Dickens", "Tolstoy", "Chaucer"] },
  { q: "What year was the first iPhone released?", a: "2007", wrong: ["2005", "2006", "2008"] },
  { q: "Who invented the telephone?", a: "Alexander Graham Bell", wrong: ["Thomas Edison", "Nikola Tesla", "Guglielmo Marconi"] },
  { q: "Who invented the light bulb?", a: "Thomas Edison", wrong: ["Nikola Tesla", "Benjamin Franklin", "James Watt"] },
  { q: "What year did Columbus reach the Americas?", a: "1492", wrong: ["1488", "1498", "1502"] },
  { q: "Who was the first Emperor of China?", a: "Qin Shi Huang", wrong: ["Kublai Khan", "Wu Zetian", "Emperor Taizong"] },
  { q: "What ancient structure is in Giza, Egypt?", a: "The Great Pyramid", wrong: ["The Sphinx only", "The Colosseum", "The Parthenon"] },
  { q: "Who was the first President of the USA to be assassinated?", a: "Abraham Lincoln", wrong: ["James Garfield", "William McKinley", "John F. Kennedy"] },

  // Pop Culture & Entertainment
  { q: "How many strings does a standard guitar have?", a: "6", wrong: ["4", "7", "8"] },
  { q: "In which sport would you perform a slam dunk?", a: "Basketball", wrong: ["Volleyball", "Tennis", "Handball"] },
  { q: "How many players are on a basketball team on court?", a: "5", wrong: ["4", "6", "7"] },
  { q: "How many players are on a soccer team?", a: "11", wrong: ["9", "10", "12"] },
  { q: "How many players are on a baseball team?", a: "9", wrong: ["8", "10", "11"] },
  { q: "How many rings are in the Olympic symbol?", a: "5", wrong: ["4", "6", "7"] },
  { q: "What sport is played at Wimbledon?", a: "Tennis", wrong: ["Cricket", "Badminton", "Squash"] },
  { q: "What country invented pizza?", a: "Italy", wrong: ["Greece", "Spain", "France"] },
  { q: "What country invented sushi?", a: "Japan", wrong: ["China", "Korea", "Thailand"] },
  { q: "What is the most watched sport in the world?", a: "Soccer", wrong: ["Basketball", "Cricket", "Baseball"] },
  { q: "How many Grand Slam tennis tournaments are there?", a: "4", wrong: ["3", "5", "6"] },
  { q: "What is the fastest land animal?", a: "Cheetah", wrong: ["Lion", "Greyhound", "Pronghorn"] },
  { q: "What animal is the symbol of the WWF?", a: "Giant Panda", wrong: ["Tiger", "Elephant", "Polar Bear"] },
  { q: "What is the largest animal on Earth?", a: "Blue Whale", wrong: ["Elephant", "Giraffe", "Colossal Squid"] },
  { q: "How many colors are in a rainbow?", a: "7", wrong: ["5", "6", "8"] },
  { q: "What is the most spoken language in the world?", a: "Mandarin", wrong: ["English", "Spanish", "Hindi"] },
  { q: "How many languages does the average Swiss person speak?", a: "4", wrong: ["2", "3", "5"] },
  { q: "What is the currency of Japan?", a: "Yen", wrong: ["Won", "Baht", "Rupee"] },
  { q: "What is the currency of the UK?", a: "Pound", wrong: ["Euro", "Dollar", "Franc"] },
  { q: "What is the most popular social media platform?", a: "Facebook", wrong: ["Instagram", "TikTok", "YouTube"] },
  { q: "How many keys does a standard piano have?", a: "88", wrong: ["76", "80", "92"] },
  { q: "What is the most streamed song on Spotify ever?", a: "Blinding Lights", wrong: ["Shape of You", "Dance Monkey", "Rockstar"] },
  { q: "Who is known as the King of Pop?", a: "Michael Jackson", wrong: ["Elvis Presley", "Prince", "David Bowie"] },
  { q: "How many episodes are in a typical anime season?", a: "12-13", wrong: ["6-8", "20-24", "26-52"] },
  { q: "What was the first video game console?", a: "Magnavox Odyssey", wrong: ["Atari 2600", "ColecoVision", "Intellivision"] },
  { q: "How many balls are on a snooker table at the start?", a: "22", wrong: ["15", "16", "21"] },
  { q: "What is the highest possible score in bowling?", a: "300", wrong: ["250", "270", "400"] },
  { q: "How many holes are in a standard golf course?", a: "18", wrong: ["9", "12", "24"] },
  { q: "What is the national sport of Canada?", a: "Lacrosse", wrong: ["Ice Hockey", "Curling", "Baseball"] },
  { q: "What year were the first modern Olympics held?", a: "1896", wrong: ["1900", "1888", "1904"] },

  // Food & Nature
  { q: "What is the most consumed meat in the world?", a: "Pork", wrong: ["Chicken", "Beef", "Lamb"] },
  { q: "How many teaspoons are in a tablespoon?", a: "3", wrong: ["2", "4", "5"] },
  { q: "What nut is in marzipan?", a: "Almond", wrong: ["Hazelnut", "Walnut", "Cashew"] },
  { q: "How many cups in a gallon?", a: "16", wrong: ["8", "12", "20"] },
  { q: "What is the main ingredient in hummus?", a: "Chickpeas", wrong: ["Lentils", "Fava beans", "Peanuts"] },
  { q: "Which fruit has the most vitamin C?", a: "Kakadu plum", wrong: ["Orange", "Lemon", "Kiwi"] },
  { q: "What is the world's most expensive spice?", a: "Saffron", wrong: ["Vanilla", "Cardamom", "Truffle"] },
  { q: "How many calories in one gram of fat?", a: "9", wrong: ["4", "7", "12"] },
  { q: "What tree do acorns come from?", a: "Oak", wrong: ["Elm", "Ash", "Beech"] },
  { q: "What is the national animal of Australia?", a: "Kangaroo", wrong: ["Koala", "Emu", "Platypus"] },
  { q: "What is the national animal of Scotland?", a: "Unicorn", wrong: ["Lion", "Stag", "Eagle"] },
  { q: "How many hearts does an octopus have?", a: "3", wrong: ["1", "2", "4"] },
  { q: "What is a group of lions called?", a: "Pride", wrong: ["Pack", "Herd", "Colony"] },
  { q: "What is a group of wolves called?", a: "Pack", wrong: ["Pride", "Herd", "Colony"] },
  { q: "How long is an elephant pregnant?", a: "22 months", wrong: ["9 months", "12 months", "18 months"] },
  { q: "What is the only mammal capable of true flight?", a: "Bat", wrong: ["Flying squirrel", "Sugar glider", "Colugos"] },
  { q: "How many eyes does a bee have?", a: "5", wrong: ["2", "3", "6"] },
  { q: "What is the loudest animal on Earth?", a: "Sperm Whale", wrong: ["Blue Whale", "Howler Monkey", "Lion"] },
  { q: "How many legs does a spider have?", a: "8", wrong: ["6", "10", "12"] },
  { q: "What is the lifespan of a housefly?", a: "28 days", wrong: ["7 days", "3 months", "1 year"] },
];

function shuffle(arr: any[]): any[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Home() {
  const [screen, setScreen] = useState("home");
  const [questions, setQuestions] = useState<any[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(3);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [showStreak, setShowStreak] = useState(false);
  const [name, setName] = useState("");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [anim, setAnim] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerRef = useRef(false);

  useEffect(() => {
    try {
      setLeaderboard(JSON.parse(localStorage.getItem("onetap_lb2") || "[]"));
      setName(localStorage.getItem("onetap_name") || "");
    } catch {}
  }, []);

  const endGame = useCallback((finalScore: number, finalBest: number, finalCorrect: number, finalTotal: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const entry = { name: name || "Anonymous", score: finalScore, streak: finalBest, date: new Date().toLocaleDateString() };
    setLeaderboard(prev => {
      const updated = [...prev, entry].sort((a, b) => b.score - a.score).slice(0, 10);
      try { localStorage.setItem("onetap_lb2", JSON.stringify(updated)); } catch {}
      return updated;
    });
    setScore(finalScore); setCorrect(finalCorrect); setTotal(finalTotal); setBestStreak(finalBest);
    setScreen("result");
  }, [name]);

  const handleAnswer = useCallback((ans: string, qs: any[], idx: number, curStreak: number, curScore: number, curCorrect: number, curTotal: number, curBest: number) => {
    if (answerRef.current) return;
    answerRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelected(ans);
    const isCorrect = ans === qs[idx].a;
    const newStreak = isCorrect ? curStreak + 1 : 0;
    const newScore = isCorrect ? curScore + 10 + Math.min(newStreak, 5) * 10 : curScore;
    const newCorrect = isCorrect ? curCorrect + 1 : curCorrect;
    const newTotal = curTotal + 1;
    const newBest = Math.max(newStreak, curBest);
    setStreak(newStreak); setAnim(isCorrect ? "pop" : "shake");
    if (isCorrect && newStreak > 1) { setShowStreak(true); setTimeout(() => setShowStreak(false), 900); }
    setTimeout(() => {
      if (idx + 1 >= qs.length) { endGame(newScore, newBest, newCorrect, newTotal); }
      else {
        const nextOpts = shuffle([qs[idx+1].a, ...qs[idx+1].wrong]);
        setQIndex(idx + 1); setOptions(nextOpts); setSelected(null); setTimeLeft(3); setAnim(""); answerRef.current = false;
      }
    }, 800);
  }, [endGame]);

  useEffect(() => {
    if (screen !== "game" || selected !== null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer("__timeout__", questions, qIndex, streak, score, correct, total, bestStreak);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, qIndex, selected, questions, streak, score, correct, total, bestStreak, handleAnswer]);

  function startGame() {
    const qs = shuffle(QUESTIONS).slice(0, 20);
    const firstOpts = shuffle([qs[0].a, ...qs[0].wrong]);
    setQuestions(qs); setQIndex(0); setOptions(firstOpts); setSelected(null);
    setTimeLeft(3); setStreak(0); setBestStreak(0); setScore(0); setCorrect(0); setTotal(0); setAnim("");
    answerRef.current = false; setScreen("game");
  }

  const q = questions[qIndex];
  const pct = (qIndex / (questions.length || 1)) * 100;
  const medals = ["🥇","🥈","🥉","4️⃣","5️⃣"];

  const LeaderboardView = () => (
    leaderboard.length > 0 ? (
      <div style={{ width:"100%", maxWidth:400, background:"#1a1a2e", borderRadius:16, padding:"20px" }}>
        <div style={{ fontSize:13, color:"#f59e0b", marginBottom:14, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700 }}>🏆 Leaderboard</div>
        {leaderboard.slice(0,5).map((e,i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 6px", borderBottom: i<4 ? "1px solid #2d2d44" : "none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:18, width:24 }}>{medals[i]}</span>
              <span style={{ color:"#e5e7eb", fontWeight:600 }}>{e.name}</span>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ color:"#f59e0b", fontWeight:800, fontSize:18 }}>{e.score}</div>
              <div style={{ color:"#6b7280", fontSize:11 }}>🔥{e.streak}</div>
            </div>
          </div>
        ))}
      </div>
    ) : null
  );

  if (screen === "home") return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", color:"#fff" }}>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:56, marginBottom:8 }}>⚡</div>
        <h1 style={{ fontSize:"2.8rem", fontWeight:900, letterSpacing:"-0.03em", margin:0, background:"linear-gradient(135deg, #f59e0b, #ef4444)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>One-Tap Trivia</h1>
        <p style={{ color:"#6b7280", marginTop:8, fontSize:"1.1rem" }}>3 seconds. One tap. No mercy.</p>
        <p style={{ color:"#4b5563", marginTop:4, fontSize:"0.85rem" }}>{QUESTIONS.length} questions · 20 per round · Geography, Science, History & more</p>
      </div>
      <div style={{ width:"100%", maxWidth:400, background:"#1a1a2e", borderRadius:16, padding:"24px", marginBottom:20 }}>
        <div style={{ fontSize:13, color:"#6b7280", marginBottom:8, letterSpacing:"0.05em", textTransform:"uppercase" }}>Your name</div>
        <input value={name} onChange={e => { setName(e.target.value); try { localStorage.setItem("onetap_name", e.target.value); } catch {} }}
          placeholder="Enter your name..."
          style={{ width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:10, color:"#fff", fontSize:16, padding:"12px 16px", outline:"none" }} />
      </div>
      <button onClick={startGame} style={{ background:"linear-gradient(135deg, #f59e0b, #ef4444)", border:"none", borderRadius:14, color:"#fff", fontSize:"1.2rem", fontWeight:800, padding:"18px 48px", cursor:"pointer", marginBottom:32 }}>
        START GAME ⚡
      </button>
      <LeaderboardView />
    </div>
  );

  if (screen === "result") return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", color:"#fff" }}>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:64, marginBottom:8 }}>{correct >= 17 ? "🏆" : correct >= 12 ? "🔥" : correct >= 7 ? "👍" : "💀"}</div>
        <h2 style={{ fontSize:"2rem", fontWeight:900, margin:0 }}>{correct >= 17 ? "Legendary!" : correct >= 12 ? "On Fire!" : correct >= 7 ? "Not Bad!" : "Keep Practicing!"}</h2>
        <p style={{ color:"#6b7280", marginTop:6 }}>{correct}/{total} correct</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:32, width:"100%", maxWidth:400 }}>
        {[["Score", score, "#f59e0b"], ["Best Streak", bestStreak + "🔥", "#ef4444"], ["Accuracy", Math.round((correct/(total||1))*100) + "%", "#10b981"]].map(([label, val, color]) => (
          <div key={label as string} style={{ background:"#1a1a2e", borderRadius:12, padding:"16px 12px", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:900, color:color as string }}>{val}</div>
            <div style={{ fontSize:11, color:"#6b7280", marginTop:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:32 }}>
        <button onClick={startGame} style={{ background:"linear-gradient(135deg, #f59e0b, #ef4444)", border:"none", borderRadius:12, color:"#fff", fontSize:"1rem", fontWeight:800, padding:"14px 28px", cursor:"pointer" }}>PLAY AGAIN ⚡</button>
        <button onClick={() => setScreen("home")} style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:12, color:"#9ca3af", fontSize:"1rem", fontWeight:600, padding:"14px 28px", cursor:"pointer" }}>Home</button>
      </div>
      <LeaderboardView />
    </div>
  );

  if (!q) return null;

  return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", padding:"20px", color:"#fff" }}>
      <div style={{ width:"100%", maxWidth:480, display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:22, fontWeight:900, color:"#f59e0b" }}>{score}</div>
        <div style={{ fontSize:13, color:"#6b7280" }}>{qIndex + 1} / {questions.length}</div>
        <div style={{ fontSize:16, fontWeight:700, color:streak > 0 ? "#ef4444" : "#4b5563" }}>🔥{streak}</div>
      </div>
      <div style={{ width:"100%", maxWidth:480, height:4, background:"#1a1a2e", borderRadius:2, marginBottom:24, overflow:"hidden" }}>
        <div style={{ height:"100%", width:pct + "%", background:"linear-gradient(90deg, #f59e0b, #ef4444)", borderRadius:2, transition:"width 0.3s" }} />
      </div>
      <div style={{ position:"relative", width:80, height:80, marginBottom:24 }}>
        <svg width="80" height="80" style={{ transform:"rotate(-90deg)" }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="#1a1a2e" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" fill="none"
            stroke={timeLeft <= 1 ? "#ef4444" : timeLeft <= 2 ? "#f59e0b" : "#10b981"}
            strokeWidth="6" strokeDasharray={213.6} strokeDashoffset={213.6 * (1 - timeLeft / 3)}
            style={{ transition:"stroke-dashoffset 0.9s linear, stroke 0.3s" }} />
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:timeLeft <= 1 ? "#ef4444" : "#fff" }}>
          {selected ? "✓" : timeLeft}
        </div>
      </div>
      {showStreak && (
        <div style={{ position:"fixed", top:"30%", left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg, #f59e0b, #ef4444)", borderRadius:16, padding:"12px 24px", fontSize:22, fontWeight:900, zIndex:100 }}>
          🔥 {streak}x STREAK!
        </div>
      )}
      <div style={{ width:"100%", maxWidth:480, background:"#1a1a2e", borderRadius:20, padding:"28px 24px", marginBottom:20, textAlign:"center" }}>
        <div style={{ fontSize:"1.3rem", fontWeight:700, lineHeight:1.4 }}>{q.q}</div>
      </div>
      <div style={{ width:"100%", maxWidth:480, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {options.map((opt, i) => {
          const isCorrect = opt === q.a;
          const isWrong = selected === opt && !isCorrect;
          const showResult = selected !== null;
          return (
            <button key={i} onClick={() => handleAnswer(opt, questions, qIndex, streak, score, correct, total, bestStreak)}
              disabled={!!selected} className={selected === opt ? anim : ""}
              style={{ background: showResult && isCorrect ? "#064e3b" : showResult && isWrong ? "#450a0a" : "#1a1a2e",
                border: `2px solid ${showResult && isCorrect ? "#10b981" : showResult && isWrong ? "#ef4444" : "#2d2d44"}`,
                borderRadius:14, color: showResult && isCorrect ? "#10b981" : showResult && isWrong ? "#ef4444" : "#e5e7eb",
                fontSize:"1rem", fontWeight:700, padding:"20px 16px", cursor:selected ? "default" : "pointer", transition:"all 0.2s", lineHeight:1.3 }}>
              {opt}
            </button>
          );
        })}
      </div>
      {selected === "__timeout__" && (
        <div style={{ marginTop:20, color:"#ef4444", fontWeight:700, fontSize:"1.1rem" }}>
          ⏰ Too slow! Answer: <span style={{ color:"#10b981" }}>{q.a}</span>
        </div>
      )}
    </div>
  );
}
