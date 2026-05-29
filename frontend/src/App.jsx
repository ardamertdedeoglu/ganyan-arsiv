import { useState, useEffect } from "react";
import "./style.css";
import {
  SavePrediction,
  GetPredictions,
  DeletePrediction,
  UpdatePrediction,
  GetDailyPrograms,
  GetProgramSilks,
  CheckForUpdate,
  PerformUpdate,
  GetAppVersion,
  GetGanyanTypes,
  ForceCheckResults,
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

function renderPerformance(last6) {
  if (!last6) return <span className="text-gray-300 text-s">—</span>;

  // Pattern: (K|S|Ç|k|s|ç)([0-9]+)
  const regex = /([KSÇksç])([0-9]+)/g;
  let matches = [];
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(last6)) !== null) {
    if (match.index > lastIndex) {
      matches.push({
        type: "text",
        value: last6.substring(lastIndex, match.index),
      });
    }
    matches.push({
      type: "badge",
      char: match[1].toUpperCase(),
      num: match[2],
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < last6.length) {
    matches.push({
      type: "text",
      value: last6.substring(lastIndex),
    });
  }

  if (matches.filter((m) => m.type === "badge").length === 0) {
    return (
      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono text-s font-bold tracking-wider">
        {last6}
      </span>
    );
  }

  const colors = {
    K: "#996633", // Kum
    S: "#d39b1e", // Sentetik
    Ç: "#009900", // Çim
  };

  const descriptions = {
    K: "Kum",
    S: "Sentetik",
    Ç: "Çim",
  };

  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-s font-bold">
      {matches.map((item, idx) => {
        if (item.type === "text") {
          return (
            <span key={idx} className="text-gray-500 px-0.5">
              {item.value}
            </span>
          );
        }

        const bgColor = colors[item.char] || "#6b7280";
        const label = descriptions[item.char] || item.char;

        return (
          <span
            key={idx}
            style={{ backgroundColor: bgColor }}
            className="text-white w-5 h-5 rounded flex items-center justify-center text-[15px] shadow-sm font-bold border border-white/10"
            title={`${label} ${item.num}`}
          >
            {item.num}
          </span>
        );
      })}
    </div>
  );
}

function calculatePredictionCost(legsState, packageType = "genis") {
  let product = 1;
  let hasHorses = false;

  for (const leg of legsState) {
    if (!leg || !leg.predictions) return 0;

    let predictionsStr = "";
    if (typeof leg.predictions === "string") {
      predictionsStr = leg.predictions;
    } else if (Array.isArray(leg.predictions)) {
      const hasZero = leg.predictions.includes(0);
      if (hasZero) {
        const zeroIndex = leg.predictions.indexOf(0);
        if (packageType === "normal") {
          predictionsStr = leg.predictions.slice(0, zeroIndex).join(",");
        } else {
          predictionsStr = leg.predictions.filter((n) => n !== 0).join(",");
        }
      } else {
        predictionsStr = leg.predictions.join(",");
      }
    }

    if (predictionsStr.includes("/")) {
      const parts = predictionsStr.split("/");
      if (packageType === "normal") {
        predictionsStr = parts[0];
      } else {
        predictionsStr = parts.join(",");
      }
    }

    const horseCount = predictionsStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "" && !isNaN(parseInt(s, 10))).length;

    if (horseCount > 0) {
      product *= horseCount;
      hasHorses = true;
    } else {
      return 0;
    }
  }

  return hasHorses ? product * 1.25 : 0;
}

const parseAGFPercentage = (agfStr) => {
  if (!agfStr) return 0;
  const match = agfStr.match(/%([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
};

function analyzeGanyanCombinations(legsAGF, poolSize = 10000000) {
  const numLegs = legsAGF.length;
  if (!legsAGF || numLegs === 0 || legsAGF.some((l) => l.length === 0)) {
    return null;
  }

  let combinations = [1];
  for (const leg of legsAGF) {
    let nextCombs = [];
    for (const p of combinations) {
      for (const agf of leg) {
        nextCombs.push(p * (agf / 100));
      }
    }
    combinations = nextCombs;
  }

  let totalWinProb = 0;
  let minPayout = Infinity;
  let maxPayout = 0;
  let totalPayoutSum = 0;

  for (const p of combinations) {
    totalWinProb += p;

    const expectedWinners = p * (poolSize / 0.625);
    let payout = 0;
    if (expectedWinners < 1) {
      payout = poolSize;
    } else {
      payout = poolSize / expectedWinners;
    }

    if (payout < minPayout) minPayout = payout;
    if (payout > maxPayout) maxPayout = payout;
    totalPayoutSum += payout;
  }

  const avgPayout = totalPayoutSum / combinations.length;

  return {
    totalWinProb: totalWinProb * 100,
    minPayout: minPayout === Infinity ? 0 : minPayout,
    maxPayout: maxPayout,
    avgPayout: avgPayout,
    totalColumns: combinations.length,
  };
}

function App() {
  const [view, setView] = useState("list"); // 'list' | 'form' | 'program'
  const [predictions, setPredictions] = useState([]);
  const [showPast, setShowPast] = useState(false);
  const [selectedCities, setSelectedCities] = useState([]);
  const [cardModes, setCardModes] = useState({}); // { [predictionId]: 'normal' | 'genis' }
  const [calculatorPrograms, setCalculatorPrograms] = useState({}); // { [date]: [Programs] }
  const [loadingCalcProgram, setLoadingCalcProgram] = useState({}); // { [date]: boolean }
  const [activeCalcCards, setActiveCalcCards] = useState({}); // { [predictionId]: boolean }
  const [poolSizes, setPoolSizes] = useState({}); // { [predictionId]: number }
  const [checkingResults, setCheckingResults] = useState(false);

  const handleForceCheckResults = () => {
    setCheckingResults(true);
    ForceCheckResults()
      .then(() => {
        setTimeout(() => {
          setCheckingResults(false);
        }, 1200);
      })
      .catch((err) => {
        console.error("Force check results failed:", err);
        setCheckingResults(false);
      });
  };

  const handleCalculateNeVerir = (pDate, forceRefresh = false) => {
    const today = new Date().toISOString().split("T")[0];
    const isTodayOrFuture = pDate >= today;

    if (calculatorPrograms[pDate] && !isTodayOrFuture && !forceRefresh) {
      return;
    }
    setLoadingCalcProgram((prev) => ({ ...prev, [pDate]: true }));
    GetDailyPrograms(pDate)
      .then((data) => {
        setCalculatorPrograms((prev) => ({ ...prev, [pDate]: data || [] }));
      })
      .catch((err) => {
        console.error("Calculator program fetch failed:", err);
      })
      .finally(() => {
        setLoadingCalcProgram((prev) => ({ ...prev, [pDate]: false }));
      });
  };

  const getCardAnalysis = (p, mode) => {
    const pDate = p.date.split("T")[0];
    const cityProg = calculatorPrograms[pDate]?.find(
      (cp) => cp.city === p.city,
    );
    if (!cityProg) return { status: "no_program" };

    // Get the parsed pool size for this specific ganyan_name
    let poolSize = 10000000; // Default fallback
    let isDefaultPool = true;
    if (cityProg.tevzi && p.ganyan_name && cityProg.tevzi[p.ganyan_name]) {
      const poolStr = cityProg.tevzi[p.ganyan_name]; // e.g. "12.272.727 ₺"
      const parsedNum = parseFloat(poolStr.replace(/[^0-9]/g, ""));
      if (!isNaN(parsedNum) && parsedNum > 0) {
        poolSize = parsedNum;
        isDefaultPool = false;
      }
    }

    const firstHorses = [];
    const legsAGF = [];
    for (const leg of p.legs) {
      const activeHorses = getLegPredictions(leg.predictions, mode);
      if (activeHorses.length === 0) {
        return { status: "invalid_legs" };
      }

      const firstHorse = activeHorses[0];
      firstHorses.push(firstHorse);

      const race = cityProg.races?.find((r, idx) => {
        const nameMatch = r.race_name.match(/(\d+)\./);
        const rNo = nameMatch ? parseInt(nameMatch[1], 10) : idx + 1;
        return rNo === leg.leg_number;
      });

      if (!race || !race.horses) {
        return { status: "invalid_legs" };
      }

      const horse = race.horses.find(
        (h) => parseInt(h.horse_no, 10) === firstHorse,
      );
      if (horse) {
        const agfPercent = parseAGFPercentage(horse.agf);
        legsAGF.push(agfPercent > 0 ? agfPercent : 1.0);
      } else {
        legsAGF.push(1.0);
      }
    }

    // P = P1 * P2 * ... * P6
    let totalWinProb = 1;
    for (const agf of legsAGF) {
      totalWinProb *= agf / 100;
    }

    // Expected winners count in the pool
    const expectedWinners = totalWinProb * (poolSize / 0.625);

    // Expected payout = Pool Size / Expected Winners (capped at Pool Size)
    let expectedPayout = 0;
    if (expectedWinners < 1) {
      expectedPayout = poolSize;
    } else {
      expectedPayout = poolSize / expectedWinners;
    }

    return {
      status: "success",
      totalWinProb: totalWinProb * 100,
      expectedPayout: expectedPayout,
      firstHorses: firstHorses,
      poolSize: poolSize,
      isDefaultPool: isDefaultPool,
    };
  };

  const getLegPredictions = (predictionsArray, mode) => {
    if (!predictionsArray) return [];
    const hasZero = predictionsArray.includes(0);
    if (hasZero) {
      const zeroIndex = predictionsArray.indexOf(0);
      if (mode === "normal") {
        return predictionsArray.slice(0, zeroIndex);
      } else {
        return predictionsArray.filter((n) => n !== 0);
      }
    }
    return predictionsArray;
  };

  // Update state
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  // Form state (yeni tahmin oluşturma)
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [city, setCity] = useState("İstanbul");
  const [legs, setLegs] = useState([
    { leg_number: 1, predictions: "" },
    { leg_number: 2, predictions: "" },
    { leg_number: 3, predictions: "" },
    { leg_number: 4, predictions: "" },
    { leg_number: 5, predictions: "" },
    { leg_number: 6, predictions: "" },
  ]);
  const [ganyanTypes, setGanyanTypes] = useState([]);
  const [selectedGanyanType, setSelectedGanyanType] = useState(null);
  const [loadingGanyanTypes, setLoadingGanyanTypes] = useState(false);

  // Edit state (mevcut tahmin düzenleme)
  const [editingPrediction, setEditingPrediction] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editIsCompleted, setEditIsCompleted] = useState(false);
  const [editLegs, setEditLegs] = useState([]);

  // Program state
  const [programDate, setProgramDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [programs, setPrograms] = useState([]);
  const [loadingProgram, setLoadingProgram] = useState(false);
  const [selectedProgramCity, setSelectedProgramCity] = useState(null);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  // silks: city -> { raceIndex -> { horseNo -> silkURL } }
  const [silks, setSilks] = useState({});
  const [loadingSilks, setLoadingSilks] = useState(false);

  // Check for updates on mount
  useEffect(() => {
    GetAppVersion()
      .then((v) => setAppVersion(v))
      .catch(() => {});

    CheckForUpdate()
      .then((result) => {
        if (result.updateAvailable) {
          setUpdateInfo(result);
        }
      })
      .catch((err) => console.error("Update check failed:", err));
  }, []);

  // Listen for background worker prediction updates
  useEffect(() => {
    const unsubscribe = EventsOn("predictions-updated", () => {
      loadPredictions();
      // Refresh cached programs for any currently loaded dates to update Tevzi and AGF values
      setCalculatorPrograms((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((date) => {
          GetDailyPrograms(date)
            .then((data) => {
              setCalculatorPrograms((curr) => ({
                ...curr,
                [date]: data || [],
              }));
            })
            .catch((err) =>
              console.error("Error refreshing program on worker update:", err),
            );
        });
        return next;
      });
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (view === "list") {
      loadPredictions();
    }
    if (view === "program" && programs.length === 0) {
      fetchPrograms(programDate);
    }
  }, [view]);

  useEffect(() => {
    if (view === "form") {
      setLoadingGanyanTypes(true);
      GetGanyanTypes(city, date)
        .then((types) => {
          setGanyanTypes(types || []);
          if (types && types.length > 0) {
            setSelectedGanyanType(types[0]);
          } else {
            setSelectedGanyanType(null);
          }
        })
        .catch((err) => {
          console.error("Ganyan tipleri alınamadı:", err);
          setGanyanTypes([]);
          setSelectedGanyanType(null);
        })
        .finally(() => {
          setLoadingGanyanTypes(false);
        });
    }
  }, [city, date, view]);

  function handleUpdate() {
    setUpdating(true);
    PerformUpdate()
      .then((result) => {
        setUpdateInfo(result);
        if (!result.updateAvailable) {
          setUpdating(false);
        } else {
          setUpdating(false);
        }
      })
      .catch((err) => {
        console.error("Update failed:", err);
        setUpdating(false);
      });
  }

  function loadPredictions() {
    GetPredictions()
      .then((data) => {
        setPredictions(data || []);
      })
      .catch((err) => {
        console.error(err);
        alert("Hata oluştu: " + err);
      });
  }

  function fetchPrograms(dateStr) {
    setLoadingProgram(true);
    setPrograms([]);
    setSelectedProgramCity(null);
    setSelectedRaceIndex(0);
    setSilks({});
    GetDailyPrograms(dateStr)
      .then((data) => {
        setPrograms(data || []);
        if (data && data.length > 0) {
          setSelectedProgramCity(data[0].city);
          // Fetch silks for all cities in parallel
          fetchAllSilks(data, dateStr);
        }
      })
      .catch((err) => {
        alert("Programlar getirilirken hata oluştu: " + err);
      })
      .finally(() => {
        setLoadingProgram(false);
      });
  }

  function fetchAllSilks(programs, dateStr) {
    setLoadingSilks(true);
    const promises = programs.map((p) =>
      GetProgramSilks(p.city, dateStr)
        .then((result) => ({ city: p.city, data: result }))
        .catch(() => ({ city: p.city, data: {} })),
    );
    Promise.all(promises).then((results) => {
      const newSilks = {};
      results.forEach(({ city, data }) => {
        // Convert numeric keys from Go map to numbers
        const normalized = {};
        if (data) {
          Object.keys(data).forEach((k) => {
            normalized[parseInt(k)] = data[k];
          });
        }
        newSilks[city] = normalized;
      });
      setSilks(newSilks);
      setLoadingSilks(false);
    });
  }

  function getSilkURL(city, raceIndex, horseNo) {
    return silks?.[city]?.[raceIndex]?.[horseNo] || null;
  }

  function handleLegChange(index, value) {
    const newLegs = [...legs];
    const val = value.replace(/[^0-9, /]/g, "");
    newLegs[index].predictions = val;
    setLegs(newLegs);
  }

  function handleSave(e) {
    e.preventDefault();

    const parsedLegs = legs.map((leg, i) => {
      const predictionsStr = leg.predictions;
      let arr = [];
      if (predictionsStr.includes("/")) {
        const parts = predictionsStr.split("/");
        const before = parts[0]
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        const after = parts[1]
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        arr = [...before, 0, ...after];
      } else {
        arr = predictionsStr
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
      }

      const actualRaceNo =
        selectedGanyanType && selectedGanyanType.races
          ? selectedGanyanType.races[i]
          : leg.leg_number;

      return {
        leg_number: actualRaceNo,
        predictions: arr,
        winner_horse: 0,
      };
    });

    const cost = calculatePredictionCost(legs, "genis");

    const p = {
      date: date,
      city: city,
      race_time: "",
      is_completed: false,
      legs: parsedLegs,
      ganyan_name: selectedGanyanType ? selectedGanyanType.name : "6'LI GANYAN",
      ganyan_legs:
        selectedGanyanType && selectedGanyanType.races
          ? selectedGanyanType.races.join("-")
          : "1-2-3-4-5-6",
      ganyan_cost: cost,
    };

    SavePrediction(p)
      .then(() => {
        setView("list");
        setLegs(legs.map((l) => ({ ...l, predictions: "" })));
      })
      .catch((err) => {
        alert("Hata: " + err);
      });
  }

  function handleDelete(id) {
    if (confirm("Bu tahmini silmek istediğinize emin misiniz?")) {
      DeletePrediction(id)
        .then(() => {
          loadPredictions();
        })
        .catch((err) => {
          alert("Silinemedi: " + err);
        });
    }
  }

  // --- EDIT functions ---
  function startEditing(p) {
    setEditingPrediction(p);
    setEditDate(p.date ? p.date.split("T")[0] : "");
    setEditCity(p.city);
    setEditIsCompleted(p.is_completed);
    // Convert legs predictions arrays to comma-separated strings (formatting separator '0' as '/')
    setEditLegs(
      (p.legs || []).map((leg) => {
        let predictionsStr = "";
        const hasZero = leg.predictions && leg.predictions.includes(0);
        if (hasZero) {
          const zeroIndex = leg.predictions.indexOf(0);
          const before = leg.predictions.slice(0, zeroIndex).join(", ");
          const after = leg.predictions.slice(zeroIndex + 1).join(", ");
          predictionsStr = `${before} / ${after}`;
        } else {
          predictionsStr = (leg.predictions || []).join(", ");
        }
        return {
          leg_number: leg.leg_number,
          predictions: predictionsStr,
          winner_horse: leg.winner_horse || 0,
        };
      }),
    );
  }

  const cancelEditing = () => {
    setEditingPrediction(null);
  };

  function handleEditLegChange(index, value) {
    const newLegs = [...editLegs];
    const val = value.replace(/[^0-9, /]/g, "");
    newLegs[index].predictions = val;
    setEditLegs(newLegs);
  }

  function handleEditWinnerChange(index, value) {
    const newLegs = [...editLegs];
    newLegs[index].winner_horse = parseInt(value, 10) || 0;
    setEditLegs(newLegs);
  }

  function handleEditSave() {
    const parsedLegs = editLegs.map((leg) => {
      const predictionsStr = leg.predictions;
      let arr = [];
      if (predictionsStr.includes("/")) {
        const parts = predictionsStr.split("/");
        const before = parts[0]
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        const after = parts[1]
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        arr = [...before, 0, ...after];
      } else {
        arr = predictionsStr
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
      }
      return {
        leg_number: leg.leg_number,
        predictions: arr,
        winner_horse: leg.winner_horse || 0,
      };
    });

    const cost = calculatePredictionCost(editLegs, "genis");

    const updated = {
      id: editingPrediction.id,
      date: editDate,
      city: editCity,
      race_time: editingPrediction.race_time || "",
      is_completed: editIsCompleted,
      legs: parsedLegs,
      ganyan_name: editingPrediction.ganyan_name || "6'LI GANYAN",
      ganyan_legs: editingPrediction.ganyan_legs || "1-2-3-4-5-6",
      ganyan_cost: cost,
    };

    UpdatePrediction(updated)
      .then(() => {
        setEditingPrediction(null);
        loadPredictions();
      })
      .catch((err) => {
        alert("Güncellenemedi: " + err);
      });
  }

  // At numaralarını SÜTUN halinde göstermek için yardımcı fonksiyon
  const renderHorseBadges = (preds, winnerHorse = 0) => {
    if (!preds || preds.length === 0)
      return <span className="text-gray-400 text-sm">-</span>;
    return (
      <div className="flex flex-col gap-1.5 mt-1">
        {preds.map((p, idx) => {
          const isWinner = winnerHorse > 0 && p === winnerHorse;
          return (
            <div
              key={idx}
              className={`w-9 h-9 flex items-center justify-center font-bold rounded-full shadow-sm text-sm transition-all duration-300 ${
                isWinner
                  ? "bg-emerald-600 border-2 border-emerald-600 text-white shadow-emerald-500/20 scale-105"
                  : "bg-white border-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              {p}
            </div>
          );
        })}
      </div>
    );
  };

  function renderProgram() {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="font-bold text-gray-700">Tarih:</label>
              <input
                type="date"
                value={programDate}
                onChange={(e) => setProgramDate(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={() => fetchPrograms(programDate)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-emerald-700 transition"
              >
                Getir
              </button>
            </div>
          </div>
        </div>

        {loadingProgram ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mb-4"></div>
            <p className="text-gray-500 font-medium">Bültenler Yükleniyor...</p>
          </div>
        ) : programs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
            <p className="text-xl text-gray-600 font-medium">
              Bu tarihe ait bülten bulunamadı.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap gap-2 mb-6">
              {programs.map((p) => (
                <button
                  key={p.city}
                  onClick={() => setSelectedProgramCity(p.city)}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors cursor-pointer ${
                    selectedProgramCity === p.city
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  {p.city}
                </button>
              ))}
            </div>

            {programs.map((p) => {
              if (p.city !== selectedProgramCity) return null;

              const selectedRace = p.races && p.races[selectedRaceIndex];

              return (
                <div key={p.city} className="space-y-4">
                  {/* Race Tabs */}
                  {p.races && (
                    <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar">
                      {p.races.map((race, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedRaceIndex(i)}
                          className={`whitespace-nowrap px-5 py-3 rounded-2xl font-bold text-sm transition-all focus:outline-none ${
                            selectedRaceIndex === i
                              ? "bg-slate-800 text-white shadow-md border-b-4 border-emerald-500"
                              : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
                          }`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="flex items-center gap-1.5">
                              <span>
                                {race.race_name.split("Saat")[0].trim() ||
                                  `${i + 1}. Koşu`}
                              </span>
                              {race.time && (
                                <span
                                  className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    selectedRaceIndex === i
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {race.time}
                                </span>
                              )}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected Race Details */}
                  {selectedRace && (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in duration-300">
                      <div className="bg-slate-800 text-white p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-4 border-emerald-500">
                        <div>
                          <h3 className="font-bold text-xl flex items-center gap-3">
                            <span>
                              {selectedRace.race_name.split("Saat")[0].trim()}
                            </span>
                            {selectedRace.time && (
                              <span className="text-emerald-400 text-m font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                                {selectedRace.time}
                              </span>
                            )}
                          </h3>
                          <div className="text-sm text-slate-300 flex flex-wrap items-center gap-2 mt-1.5">
                            {selectedRace.condition && (
                              <span className="font-semibold text-emerald-300">
                                {selectedRace.condition}
                              </span>
                            )}
                            {selectedRace.age_group && (
                              <>
                                <span>•</span>
                                <span className="bg-slate-700 text-amber-300 px-2 py-0.5 rounded-md text-s font-bold border border-slate-600">
                                  {selectedRace.age_group}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-sm font-medium bg-slate-700 px-4 py-2 rounded-xl border border-slate-600">
                          {selectedRace.distance}
                        </div>
                      </div>
                      <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider text-xs">
                              <th className="p-3 w-10 text-center">No</th>
                              <th className="p-3 w-14 text-center">Forma</th>
                              <th className="p-3">At İsmi / Yaş</th>
                              <th className="p-3">Kilo</th>
                              <th className="p-3">Jokey</th>
                              <th className="p-3">Sahip / Antrenör</th>
                              <th className="p-3">Orijin (Baba - Anne)</th>
                              <th className="p-3 text-center">St / H</th>
                              <th className="p-3 text-center">AGF</th>
                              <th className="p-3">Performans</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {selectedRace.horses &&
                              selectedRace.horses.map((horse, j) => (
                                <tr
                                  key={j}
                                  className="hover:bg-emerald-50/50 transition-colors"
                                >
                                  <td className="p-3 font-bold text-center text-gray-400 text-base">
                                    {horse.horse_no}
                                  </td>
                                  {/* Forma / Silk */}
                                  <td className="p-2 text-center">
                                    {(() => {
                                      const silkURL = getSilkURL(
                                        p.city,
                                        selectedRaceIndex,
                                        horse.horse_no,
                                      );
                                      if (silkURL) {
                                        return (
                                          <img
                                            src={silkURL}
                                            alt={`Forma ${horse.horse_no}`}
                                            className="h-12 w-auto object-contain rounded mx-auto"
                                            onError={(e) => {
                                              e.target.style.display = "none";
                                            }}
                                          />
                                        );
                                      } else if (loadingSilks) {
                                        return (
                                          <div className="w-6 h-6 mx-auto rounded-full border-2 border-gray-200 border-t-emerald-400 animate-spin" />
                                        );
                                      } else {
                                        return (
                                          <span className="text-gray-300 text-xs">
                                            —
                                          </span>
                                        );
                                      }
                                    })()}
                                  </td>
                                  <td className="p-3">
                                    <div className="font-bold text-gray-800 text-base">
                                      {horse.name}
                                    </div>
                                    <div className="text-xs text-gray-500 font-medium mt-0.5">
                                      {horse.age}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div className="font-bold text-emerald-700 text-base">
                                      {horse.weight}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div className="font-semibold text-gray-800">
                                      {horse.jockey}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div
                                      className="font-semibold text-gray-700 text-sm truncate max-w-[150px]"
                                      title={horse.owner}
                                    >
                                      {horse.owner}
                                    </div>
                                    <div
                                      className="text-xs text-gray-500 font-medium mt-0.5 truncate max-w-[150px]"
                                      title={horse.trainer}
                                    >
                                      {horse.trainer}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div
                                      className="text-xs text-gray-500 max-w-[180px] truncate whitespace-normal"
                                      title={`${horse.sire} - ${horse.dam}`}
                                    >
                                      <span className="font-semibold text-gray-700">
                                        {horse.sire}
                                      </span>{" "}
                                      - {horse.dam}
                                    </div>
                                  </td>
                                  <td className="p-3 text-center">
                                    <div className="font-bold text-gray-700">
                                      {horse.st}
                                    </div>
                                    {horse.h && (
                                      <div className="text-xs text-gray-400 mt-0.5">
                                        H: {horse.h}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3 text-center">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold text-xs">
                                      {horse.agf || "-"}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                        {renderPerformance(horse.last6)}
                                      </div>
                                      {(horse.kgs || horse.s20) && (
                                        <div className="text-xs text-gray-400">
                                          {horse.kgs && (
                                            <span
                                              className="mr-2"
                                              title="KGS (Ganyan) / S20"
                                            >
                                              KGS: {horse.kgs}
                                            </span>
                                          )}
                                          {horse.s20 && (
                                            <span title="S20 / Fark">
                                              S20: {horse.s20}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Edit Modal ---
  function renderEditModal() {
    if (!editingPrediction) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">Tahmini Düzenle</h2>
            <button
              onClick={cancelEditing}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Temel Bilgiler */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Tarih
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Şehir
                </label>
                <select
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="İstanbul">İstanbul</option>
                  <option value="Ankara">Ankara</option>
                  <option value="İzmir">İzmir</option>
                  <option value="Adana">Adana</option>
                  <option value="Bursa">Bursa</option>
                  <option value="Kocaeli">Kocaeli</option>
                  <option value="Antalya">Antalya</option>
                  <option value="Şanlıurfa">Şanlıurfa</option>
                  <option value="Elazığ">Elazığ</option>
                  <option value="Diyarbakır">Diyarbakır</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setEditIsCompleted(!editIsCompleted)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${editIsCompleted ? "bg-emerald-500" : "bg-gray-300"}`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${editIsCompleted ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {editIsCompleted ? "✓ Sonuçlandı" : "⏱ Sonuç Bekleniyor"}
                  </span>
                </label>
              </div>
            </div>

            {/* Ayaklar */}
            <div>
              <h3 className="font-bold text-base text-gray-800 mb-3">
                Ayak Tahminleri
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {editLegs.map((leg, i) => (
                  <div
                    key={i}
                    className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2 focus-within:ring-2 focus-within:ring-emerald-200 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                        {editingPrediction?.ganyan_legs
                          ? `${leg.leg_number}. Koşu`
                          : `${leg.leg_number}. Ayak`}
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">Kazanan:</span>
                        <input
                          type="number"
                          min="0"
                          value={leg.winner_horse || ""}
                          onChange={(e) =>
                            handleEditWinnerChange(i, e.target.value)
                          }
                          placeholder="0"
                          className="w-14 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-400 text-center font-bold"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={leg.predictions}
                      onChange={(e) => handleEditLegChange(i, e.target.value)}
                      placeholder="Örn: 5, 3, 1, 12"
                      className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
            {(() => {
              const costNormal = calculatePredictionCost(editLegs, "normal");
              const costGenis = calculatePredictionCost(editLegs, "genis");
              const hasSlash = editLegs.some((l) =>
                l.predictions.includes("/"),
              );

              return (
                <div className="flex items-center gap-2.5 bg-emerald-50 text-emerald-800 px-4 py-2 rounded-xl border border-emerald-100 select-none">
                  <svg
                    className="w-5 h-5 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="text-left">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide block leading-none">
                      Güncel Tutar
                    </span>
                    {hasSlash ? (
                      <span className="font-bold text-xs leading-normal block mt-0.5">
                        Norm:{" "}
                        <span className="font-extrabold text-emerald-700">
                          {costNormal.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          ₺
                        </span>{" "}
                        | Gen:{" "}
                        <span className="font-extrabold text-indigo-700">
                          {costGenis.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          ₺
                        </span>
                      </span>
                    ) : (
                      <span className="font-extrabold text-sm leading-tight">
                        {costGenis.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        ₺
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-3 justify-end w-full sm:w-auto">
              <button
                onClick={cancelEditing}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors text-sm"
              >
                İptal
              </button>
              <button
                onClick={handleEditSave}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors text-sm shadow-md"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-left font-sans py-8">
      {/* Edit Modal */}
      {renderEditModal()}

      {/* Update Notification Banner */}
      {updateInfo && updateInfo.updateAvailable && !updateDismissed && (
        <div className="fixed top-0 left-0 right-0 z-50 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-3 flex items-center justify-center gap-4 shadow-lg">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 animate-bounce"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span className="font-semibold text-sm">
                Yeni sürüm mevcut:{" "}
                <span className="font-bold">{updateInfo.latestVersion}</span>
                <span className="text-emerald-200 ml-1">
                  (mevcut: {updateInfo.currentVersion})
                </span>
              </span>
            </div>
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="bg-white text-emerald-700 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {updating ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Güncelleniyor...
                </>
              ) : (
                "Güncelle"
              )}
            </button>
            <button
              onClick={() => setUpdateDismissed(true)}
              className="text-white/70 hover:text-white transition-colors p-1"
              title="Kapat"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Update Success Banner */}
      {updateInfo &&
        !updateInfo.updateAvailable &&
        updateInfo.message &&
        updateInfo.message.includes("başarılı") && (
          <div className="fixed top-0 left-0 right-0 z-50 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 flex items-center justify-center gap-4 shadow-lg">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-semibold text-sm">
                  {updateInfo.message}
                </span>
              </div>
            </div>
          </div>
        )}

      <div
        className={`container mx-auto px-4 transition-all duration-500 ${
          updateInfo &&
          ((updateInfo.updateAvailable && !updateDismissed) ||
            updateInfo.message?.includes("başarılı"))
            ? "pt-12"
            : ""
        } ${view === "program" ? "max-w-[95%]" : "max-w-5xl"}`}
      >
        {/* Header Navbar */}
        <header className="flex justify-between items-center bg-white shadow-sm border border-gray-100 p-4 rounded-2xl mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 text-white p-3 rounded-xl shadow-inner">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">
                Hedef Bülten
              </h1>
              {appVersion && (
                <span className="text-xs text-gray-400 font-medium">
                  {appVersion}
                </span>
              )}
            </div>
          </div>
          <nav className="flex gap-2 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setView("list")}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${view === "list" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"}`}
            >
              Ana Sayfa
            </button>
            <button
              onClick={() => setView("program")}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${view === "program" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"}`}
            >
              Yarış Programı
            </button>
            <button
              onClick={() => setView("form")}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${view === "form" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"}`}
            >
              + Yeni Tahmin
            </button>
          </nav>
        </header>

        {/* Form View */}
        {view === "form" && (
          <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800">
                Tahmin Oluştur
              </h2>
              <p className="text-gray-500 mt-1">
                Yarışın temel bilgilerini ve ayak tahminlerinizi girin.
              </p>
            </div>

            <form onSubmit={handleSave}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                    Tarih
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full bg-white border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                    Şehir
                  </label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    className="w-full bg-white border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                  >
                    <option value="İstanbul">İstanbul</option>
                    <option value="Ankara">Ankara</option>
                    <option value="İzmir">İzmir</option>
                    <option value="Adana">Adana</option>
                    <option value="Bursa">Bursa</option>
                    <option value="Kocaeli">Kocaeli</option>
                    <option value="Antalya">Antalya</option>
                    <option value="Şanlıurfa">Şanlıurfa</option>
                    <option value="Elazığ">Elazığ</option>
                    <option value="Diyarbakır">Diyarbakır</option>
                  </select>
                </div>
              </div>

              {/* Pick 6 Program Selector */}
              <div className="mb-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200/60 shadow-sm animate-in fade-in duration-300">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3.5 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-600 animate-pulse"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  Hangi Altılı Ganyan?
                </h3>
                {loadingGanyanTypes ? (
                  <div className="flex items-center gap-3 py-2 text-slate-500 font-medium">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-emerald-500 animate-spin" />
                    <span>Ganyan Programı Yükleniyor...</span>
                  </div>
                ) : ganyanTypes.length === 0 ? (
                  <div className="text-slate-500 text-sm bg-white p-4 rounded-xl border border-slate-100 font-medium">
                    Seçilen tarih ve şehir için 6'lı Ganyan bülteni bulunamadı.
                    Lütfen geçerli bir tarih ve şehir seçin.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ganyanTypes.map((type, idx) => {
                      const isSelected = selectedGanyanType?.name === type.name;
                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedGanyanType(type)}
                          className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center justify-between group select-none shadow-sm ${
                            isSelected
                              ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/10 shadow-emerald-500/5"
                              : "bg-white border-slate-200 hover:border-emerald-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <div>
                            <div
                              className={`font-black text-sm transition-colors ${isSelected ? "text-emerald-700" : "text-slate-700 group-hover:text-emerald-600"}`}
                            >
                              {type.name}
                            </div>
                            <div className="text-xs text-slate-400 font-bold mt-1 tracking-wider">
                              Koşular: {type.races.join(" - ")}
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-slate-300"
                            }`}
                          >
                            {isSelected && (
                              <svg
                                className="w-3.5 h-3.5 stroke-[3]"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M4.5 12.75l6 6 9-13.5"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-xl text-gray-800 mb-4">
                  Ayak Tahminleri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {legs.map((leg, i) => {
                    const actualRaceNo = selectedGanyanType?.races
                      ? selectedGanyanType.races[i]
                      : null;
                    return (
                      <div
                        key={i}
                        className="flex flex-col bg-white border border-gray-200 p-4 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-emerald-100 transition-all"
                      >
                        <label className="text-sm font-bold text-emerald-600 mb-2 flex items-center justify-between">
                          <span>{i + 1}. Ayak (Virgülle Ayırın)</span>
                          {actualRaceNo && (
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-black border border-emerald-100 shadow-sm">
                              {actualRaceNo}. Koşu
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={leg.predictions}
                          onChange={(e) => handleLegChange(i, e.target.value)}
                          placeholder="Örn: 5, 3, 1, 12"
                          className="w-full text-lg outline-none bg-transparent"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {(() => {
                const costNormal = calculatePredictionCost(legs, "normal");
                const costGenis = calculatePredictionCost(legs, "genis");
                const hasSlash = legs.some((l) => l.predictions.includes("/"));

                return (
                  <div className="mt-10 flex flex-col md:flex-row items-center justify-between border-t border-gray-100 pt-6 gap-4">
                    <div className="flex items-center gap-3 bg-emerald-50 text-emerald-800 px-6 py-3.5 rounded-2xl border border-emerald-100 shadow-sm select-none">
                      <svg
                        className="w-6 h-6 text-emerald-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <div className="text-left">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 leading-none">
                          Tahmini Kupon Tutarı
                        </div>
                        {hasSlash ? (
                          <div className="text-sm font-bold leading-tight mt-0.5 space-y-0.5">
                            <div>
                              Normal Paket:{" "}
                              <span className="font-extrabold text-emerald-700">
                                {costNormal.toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                ₺
                              </span>
                            </div>
                            <div>
                              Geniş Paket:{" "}
                              <span className="font-extrabold text-indigo-700">
                                {costGenis.toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                ₺
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-2xl font-black leading-tight mt-0.5">
                            {costGenis.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            ₺
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full md:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                    >
                      Arşive Ekle
                    </button>
                  </div>
                );
              })()}
            </form>
          </div>
        )}

        {/* List View */}
        {view === "list" &&
          (() => {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, "0");
            const dd = String(today.getDate()).padStart(2, "0");
            const todayStr = `${yyyy}-${mm}-${dd}`;

            const uniqueCities = [
              ...new Set(predictions.map((p) => p.city).filter(Boolean)),
            ].sort();

            const toggleCityFilter = (city) => {
              if (selectedCities.includes(city)) {
                setSelectedCities(selectedCities.filter((c) => c !== city));
              } else {
                setSelectedCities([...selectedCities, city]);
              }
            };

            const displayedPredictions = predictions.filter((p) => {
              const isPast = p.date && p.date.split("T")[0] < todayStr;
              const matchesPastFilter = showPast ? true : !isPast;
              const matchesCityFilter =
                selectedCities.length === 0
                  ? true
                  : selectedCities.includes(p.city);
              return matchesPastFilter && matchesCityFilter;
            });

            return (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {predictions.length > 0 && (
                  <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm space-y-4">
                    {/* Top Bar: Count & Filters */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-gray-100/70">
                      <div className="text-slate-600 text-sm font-medium">
                        Toplam{" "}
                        <span className="font-bold text-slate-800">
                          {predictions.length}
                        </span>{" "}
                        tahminden{" "}
                        <span className="font-bold text-emerald-700">
                          {displayedPredictions.length}
                        </span>{" "}
                        tanesi gösteriliyor.
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        {/* Force Check Results Button */}
                        <button
                          onClick={handleForceCheckResults}
                          disabled={checkingResults}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none ${
                            checkingResults
                              ? "bg-slate-800 text-white border-slate-700 shadow-sm"
                              : "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 hover:text-emerald-800"
                          }`}
                          title="TJK yarış sonuçlarını hemen kontrol et ve tahminleri güncelle"
                        >
                          <div className="flex items-center gap-1">
                            {checkingResults
                              ? "Güncelleniyor..."
                              : "Sonuçları Güncelle"}
                          </div>
                        </button>

                        {/* Past Toggle */}
                        <label className="flex items-center gap-3 cursor-pointer select-none group">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={showPast}
                              onChange={(e) => setShowPast(e.target.checked)}
                              className="sr-only"
                            />
                            <div
                              className={`w-11 h-6 rounded-full transition-all duration-300 ${
                                showPast
                                  ? "bg-emerald-600 shadow-md"
                                  : "bg-gray-200"
                              }`}
                            />
                            <div
                              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${
                                showPast ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </div>
                          <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                            Geçmiş Tahminleri Göster
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* City Filters */}
                    {uniqueCities.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">
                          Şehir Filtresi:
                        </span>
                        <button
                          onClick={() => setSelectedCities([])}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            selectedCities.length === 0
                              ? "bg-slate-800 text-white shadow-sm"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          Tümü
                        </button>
                        {uniqueCities.map((city) => {
                          const isActive = selectedCities.includes(city);
                          return (
                            <button
                              key={city}
                              onClick={() => toggleCityFilter(city)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                isActive
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {isActive && (
                                <svg
                                  className="w-3 h-3 stroke-[3]"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4.5 12.75l6 6 9-13.5"
                                  />
                                </svg>
                              )}
                              {city}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {predictions.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-3xl border border-gray-100 shadow-sm">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-10 h-10 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-xl text-gray-600 font-medium">
                      Henüz kayıtlı bir tahmin yok
                    </p>
                    <button
                      onClick={() => setView("form")}
                      className="mt-4 text-emerald-600 font-bold hover:underline"
                    >
                      İlk veriyi ekleyerek başla
                    </button>
                  </div>
                ) : displayedPredictions.length === 0 ? (
                  (() => {
                    const hasCityFilter = selectedCities.length > 0;
                    const hasPastFilter = !showPast;

                    return (
                      <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm animate-in fade-in duration-300">
                        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg
                            className="w-10 h-10 text-emerald-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                        </div>
                        <p className="text-xl text-gray-600 font-semibold px-4">
                          Kriterlere uygun tahmin bulunamadı.
                        </p>
                        <p className="text-gray-400 text-sm mt-1.5 px-4 font-medium">
                          {hasPastFilter && hasCityFilter
                            ? "Seçilen şehirlerde güncel tahmin bulunmuyor. Şehir filtrelerini temizleyebilir veya geçmiş tahminleri göstermeyi deneyebilirsiniz."
                            : hasCityFilter
                              ? "Seçilen şehirlerde kriterlerinize uygun tahmin bulunmuyor. Şehir filtrelerini temizlemeyi deneyebilirsiniz."
                              : "Güncel tahmininiz bulunmuyor. Geçmiş tahminleri göstermeyi deneyebilirsiniz."}
                        </p>
                        <div className="mt-6 flex flex-wrap justify-center gap-3">
                          {hasCityFilter && (
                            <button
                              onClick={() => setSelectedCities([])}
                              className="px-5 py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition shadow-sm"
                            >
                              Filtreleri Temizle
                            </button>
                          )}
                          {hasPastFilter && (
                            <button
                              onClick={() => setShowPast(true)}
                              className="px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition shadow-sm"
                            >
                              Geçmiş Tahminleri Göster
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {displayedPredictions.map((p) => {
                      const isPast = p.date && p.date.split("T")[0] < todayStr;
                      const hasSlashInCard =
                        p.legs &&
                        p.legs.some(
                          (leg) =>
                            leg.predictions && leg.predictions.includes(0),
                        );
                      const activeMode = cardModes[p.id] || "normal";

                      return (
                        <div
                          key={p.id}
                          className={`bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all relative overflow-hidden group ${
                            isPast ? "opacity-60 grayscale-[10%]" : ""
                          }`}
                        >
                          <div
                            className={`absolute top-0 left-0 w-2 h-full ${
                              isPast ? "bg-slate-300" : "bg-emerald-500"
                            }`}
                          />

                          {/* Action buttons */}
                          <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEditing(p)}
                              className="text-gray-400 hover:text-emerald-600 bg-gray-50 hover:bg-emerald-50 p-2 rounded-full transition-colors"
                              title="Düzenle"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 p-2 rounded-full transition-colors"
                              title="Sil"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>

                          <div className="flex flex-col gap-3.5 mb-6 pl-4 pr-16 md:pr-24">
                            {/* Row 1: City, Date, Status */}
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                                {p.city}
                              </h3>
                              <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200/50">
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                                {p.date
                                  .split("T")[0]
                                  .split("-")
                                  .reverse()
                                  .join("-")}
                              </span>
                              {isPast && (
                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-slate-200/60 flex items-center gap-1 uppercase tracking-wider select-none">
                                  ⏱ Geçmiş
                                </span>
                              )}
                              <span
                                className={`px-3 py-1 rounded-xl text-xs font-bold border shadow-sm ${
                                  p.is_completed
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                                    : "bg-amber-50 text-amber-700 border-amber-100"
                                }`}
                              >
                                {p.is_completed
                                  ? "✓ Sonuçlandı"
                                  : "⏱ Sonuç Bekleniyor"}
                              </span>
                            </div>

                            {/* Row 2: Ganyan Type, Cost, Mode Switcher, Ne Verir Button */}
                            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100/70">
                              {p.ganyan_name && (
                                <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-black border border-emerald-100 shadow-sm flex items-center gap-1.5">
                                  <svg
                                    className="w-3.5 h-3.5 stroke-[2.5]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                  </svg>
                                  {p.ganyan_name} ({p.ganyan_legs})
                                </span>
                              )}
                              {(() => {
                                const progDate = p.date.split("T")[0];
                                const cityProg = calculatorPrograms[
                                  progDate
                                ]?.find((cp) => cp.city === p.city);
                                if (
                                  cityProg &&
                                  cityProg.tevzi &&
                                  p.ganyan_name &&
                                  cityProg.tevzi[p.ganyan_name]
                                ) {
                                  const poolStr = cityProg.tevzi[p.ganyan_name]; // e.g. "12.272.727 ₺"
                                  return (
                                    <span className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl text-xs font-black border border-amber-100 shadow-sm flex items-center gap-1.5 animate-in fade-in duration-300">
                                      💰 Havuz: {poolStr}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {(() => {
                                const dynamicCost = calculatePredictionCost(
                                  p.legs,
                                  activeMode,
                                );
                                if (dynamicCost <= 0) return null;
                                return (
                                  <span
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 border transition-colors duration-300 ${
                                      activeMode === "normal"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                        : "bg-indigo-50 text-indigo-700 border-indigo-100"
                                    }`}
                                  >
                                    {dynamicCost.toLocaleString("tr-TR", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}{" "}
                                    ₺
                                  </span>
                                );
                              })()}
                              {hasSlashInCard && (
                                <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 shadow-inner select-none animate-in fade-in duration-300">
                                  <button
                                    onClick={() =>
                                      setCardModes((prev) => ({
                                        ...prev,
                                        [p.id]: "normal",
                                      }))
                                    }
                                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                      activeMode === "normal"
                                        ? "bg-white text-emerald-700 shadow-sm"
                                        : "text-slate-500 hover:text-slate-800"
                                    }`}
                                  >
                                    Normal
                                  </button>
                                  <button
                                    onClick={() =>
                                      setCardModes((prev) => ({
                                        ...prev,
                                        [p.id]: "genis",
                                      }))
                                    }
                                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                      activeMode === "genis"
                                        ? "bg-white text-indigo-700 shadow-sm"
                                        : "text-slate-500 hover:text-slate-800"
                                    }`}
                                  >
                                    Geniş
                                  </button>
                                </div>
                              )}
                              {(() => {
                                const isExpanded =
                                  activeCalcCards[p.id] || false;
                                return (
                                  <button
                                    onClick={() => {
                                      const nextExpanded = !isExpanded;
                                      setActiveCalcCards((prev) => ({
                                        ...prev,
                                        [p.id]: nextExpanded,
                                      }));
                                      if (nextExpanded) {
                                        handleCalculateNeVerir(
                                          p.date.split("T")[0],
                                          true,
                                        );
                                      }
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1 transition-all select-none cursor-pointer ${
                                      isExpanded
                                        ? "bg-slate-800 text-white border-slate-700 shadow-sm"
                                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800"
                                    }`}
                                  >
                                    <svg
                                      className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2.5}
                                        d="M19 9l-7 7-7-7"
                                      />
                                    </svg>
                                    Ne Verir?
                                  </button>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Legs - alt alta dizili at numaraları */}
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 pl-4">
                            {p.legs &&
                              p.legs.map((leg, i) => {
                                const activePreds = getLegPredictions(
                                  leg.predictions,
                                  activeMode,
                                );
                                const hasWinnerInLeg = leg.winner_horse > 0;
                                const isWinnerGuessed =
                                  hasWinnerInLeg &&
                                  activePreds.includes(leg.winner_horse);
                                const isLegLost =
                                  hasWinnerInLeg && !isWinnerGuessed;

                                return (
                                  <div
                                    key={i}
                                    className={`border transition-all relative overflow-hidden rounded-2xl p-3 ${
                                      isLegLost
                                        ? "bg-red-50/40 border-red-200/60 opacity-60 text-slate-400 line-through decoration-red-500/80 decoration-2"
                                        : isWinnerGuessed
                                          ? "bg-emerald-50/30 border-emerald-200/60 ring-1 ring-emerald-500/10 shadow-sm shadow-emerald-500/5"
                                          : isPast
                                            ? "bg-slate-50 border-gray-100 hover:bg-slate-100"
                                            : "bg-gray-50 border-gray-100 hover:bg-emerald-50"
                                    }`}
                                  >
                                    <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                                      {p.ganyan_legs
                                        ? `${leg.leg_number}. Koşu`
                                        : `${leg.leg_number}. Ayak`}
                                    </div>
                                    {renderHorseBadges(
                                      activePreds,
                                      leg.winner_horse,
                                    )}
                                    {leg.winner_horse > 0 && (
                                      <div className="mt-2 flex items-center gap-1">
                                        <span className="text-xs text-gray-400">
                                          Kazanan:
                                        </span>
                                        <span
                                          className={`w-6 h-6 flex items-center justify-center font-bold rounded-full text-xs border ${
                                            isWinnerGuessed
                                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                              : "bg-red-100 text-red-700 border-red-200"
                                          }`}
                                        >
                                          {leg.winner_horse}
                                        </span>
                                      </div>
                                    )}
                                    {isLegLost && (
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="w-[140%] h-[2.5px] bg-red-500/30 rotate-12 transform absolute" />
                                        <div className="w-[140%] h-[2.5px] bg-red-500/30 -rotate-12 transform absolute" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>

                          {/* Ne Verir Panel */}
                          {(() => {
                            const isExpanded = activeCalcCards[p.id] || false;
                            const pDate = p.date.split("T")[0];

                            if (!isExpanded) return null;

                            return (
                              <div className="mt-6 pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
                                {loadingCalcProgram[pDate] ? (
                                  <div className="flex items-center justify-center gap-3 py-6 text-slate-500 font-medium bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-emerald-500 animate-spin" />
                                    <span>
                                      Yarış Bülteni Yükleniyor ve
                                      Eşleştiriliyor...
                                    </span>
                                  </div>
                                ) : (
                                  (() => {
                                    const analysis = getCardAnalysis(
                                      p,
                                      activeMode,
                                    );

                                    if (analysis.status === "no_program") {
                                      return (
                                        <div className="text-center py-6 bg-amber-50/50 border border-amber-100 rounded-2xl text-amber-700 text-sm font-semibold select-none">
                                          ⚠️ Bu tarihe ait bülten bültenler
                                          arasında bulunamadı veya henüz
                                          yüklenmedi.
                                        </div>
                                      );
                                    }

                                    if (analysis.status === "invalid_legs") {
                                      return (
                                        <div className="text-center py-6 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm font-semibold select-none">
                                          ❌ Tahmin bilgileri eksik veya at
                                          seçimi yapılmamış.
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-inner space-y-6">
                                        {/* Header: Panel Title */}
                                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                          <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                                            📊 İlk Tercih İkramiye Beklentisi
                                            (AGF Analizi)
                                          </h4>
                                          <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-700 select-none">
                                            İlk Tercih Kombinasyonu
                                          </span>
                                        </div>

                                        {/* Portfolio Metrics Grid */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          {/* Kazanma Olasılığı */}
                                          <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                              Kombinasyon Kazanma İhtimali
                                            </span>
                                            <span className="text-2xl font-black text-emerald-400">
                                              %{" "}
                                              {analysis.totalWinProb.toLocaleString(
                                                "tr-TR",
                                                { maximumFractionDigits: 6 },
                                              )}
                                            </span>
                                          </div>

                                          {/* Tahmini Ödeme */}
                                          <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                              Tahmini İkramiye Ödemesi (6'lı
                                              Ganyan)
                                            </span>
                                            <span className="text-2xl font-black text-indigo-400">
                                              {analysis.expectedPayout.toLocaleString(
                                                "tr-TR",
                                                {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                },
                                              )}{" "}
                                              ₺
                                            </span>
                                          </div>
                                        </div>

                                        {/* Birinci Atlar Kombinasyonu */}
                                        <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex items-center justify-between flex-wrap gap-2">
                                          <div>
                                            <span className="text-xs font-bold text-slate-400 block">
                                              Birinci Tercihler
                                            </span>
                                            <span className="text-xs text-slate-500 font-medium">
                                              Ayaklardaki ilk atların
                                              kombinasyonu.
                                            </span>
                                          </div>
                                          <div className="flex gap-2">
                                            {analysis.firstHorses.map(
                                              (hNo, idx) => (
                                                <span
                                                  key={idx}
                                                  className="w-8 h-8 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 flex items-center justify-center font-bold text-sm"
                                                >
                                                  {hNo}
                                                </span>
                                              ),
                                            )}
                                          </div>
                                        </div>

                                        {/* TJK Pool Size details */}
                                        <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
                                          <div>
                                            <span className="text-xs font-bold text-slate-400 block">
                                              TJK Toplam Dağıtılacak Tutar
                                              (Tevzi)
                                            </span>
                                            <span className="text-[10.5px] text-slate-500 font-medium block">
                                              {analysis.isDefaultPool
                                                ? "⏱ Koşular tamamlanmadığı için sonuç bekleniyor. (Tahmini havuz kullanılmıştır)"
                                                : "✓ TJK resmi sonuçlarından çekilen gerçek tevzi tutarı."}
                                            </span>
                                          </div>
                                          <span
                                            className={`text-base font-extrabold px-3 py-1 rounded-xl border ${
                                              analysis.isDefaultPool
                                                ? "text-amber-400 bg-amber-950/20 border-amber-900/30"
                                                : "text-emerald-400 bg-emerald-950/20 border-emerald-900/30"
                                            }`}
                                          >
                                            {analysis.poolSize.toLocaleString(
                                              "tr-TR",
                                            )}{" "}
                                            ₺
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })()
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        {/* Program View */}
        {view === "program" && renderProgram()}
      </div>
    </div>
  );
}

export default App;
