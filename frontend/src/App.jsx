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
} from "../wailsjs/go/main/App";

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

function App() {
  const [view, setView] = useState("list"); // 'list' | 'form' | 'program'
  const [predictions, setPredictions] = useState([]);

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

  useEffect(() => {
    if (view === "list") {
      loadPredictions();
    }
    if (view === "program" && programs.length === 0) {
      fetchPrograms(programDate);
    }
  }, [view]);

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
    const val = value.replace(/[^0-9, ]/g, "");
    newLegs[index].predictions = val;
    setLegs(newLegs);
  }

  function handleSave(e) {
    e.preventDefault();

    const parsedLegs = legs.map((leg) => {
      const arr = leg.predictions
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      return {
        leg_number: leg.leg_number,
        predictions: arr,
        winner_horse: 0,
      };
    });

    const p = {
      date: date,
      city: city,
      race_time: "",
      is_completed: false,
      legs: parsedLegs,
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
    // Convert legs predictions arrays to comma-separated strings
    setEditLegs(
      (p.legs || []).map((leg) => ({
        leg_number: leg.leg_number,
        predictions: (leg.predictions || []).join(", "),
        winner_horse: leg.winner_horse || 0,
      })),
    );
  }

  function cancelEditing() {
    setEditingPrediction(null);
  }

  function handleEditLegChange(index, value) {
    const newLegs = [...editLegs];
    const val = value.replace(/[^0-9, ]/g, "");
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
      const arr = leg.predictions
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      return {
        leg_number: leg.leg_number,
        predictions: arr,
        winner_horse: leg.winner_horse || 0,
      };
    });

    const updated = {
      id: editingPrediction.id,
      date: editDate,
      city: editCity,
      race_time: editingPrediction.race_time || "",
      is_completed: editIsCompleted,
      legs: parsedLegs,
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
  const renderHorseBadges = (preds) => {
    if (!preds || preds.length === 0)
      return <span className="text-gray-400 text-sm">-</span>;
    return (
      <div className="flex flex-col gap-1.5 mt-1">
        {preds.map((p, idx) => (
          <div
            key={idx}
            className="w-9 h-9 flex items-center justify-center bg-white border-2 border-emerald-500 text-emerald-700 font-bold rounded-full shadow-sm text-sm"
          >
            {p}
          </div>
        ))}
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
                        {leg.leg_number}. Ayak
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

          <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
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
                TJK Ganyan Arşiv
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

              <div className="space-y-4">
                <h3 className="font-bold text-xl text-gray-800 mb-4">
                  Ayak Tahminleri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {legs.map((leg, i) => (
                    <div
                      key={i}
                      className="flex flex-col bg-white border border-gray-200 p-4 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-emerald-100 transition-all"
                    >
                      <label className="text-sm font-bold text-emerald-600 mb-2">
                        {i + 1}. Ayak (Virgülle Ayırın)
                      </label>
                      <input
                        type="text"
                        value={leg.predictions}
                        onChange={(e) => handleLegChange(i, e.target.value)}
                        placeholder="Örn: 5, 3, 1, 12"
                        className="w-full text-lg outline-none bg-transparent"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-10 flex border-t border-gray-100 pt-6">
                <button
                  type="submit"
                  className="w-full md:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                >
                  Arşive Ekle
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List View */}
        {view === "list" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {predictions.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-shadow relative overflow-hidden group"
                  >
                    <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>

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

                    <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6 pr-24 pl-4">
                      <div>
                        <h3 className="text-2xl font-extrabold text-gray-800">
                          {p.city}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-md text-sm font-semibold flex items-center gap-1">
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
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            {p.date.split("T")[0]}
                          </span>
                        </div>
                      </div>
                      <div className="md:ml-auto">
                        <span
                          className={`px-4 py-1.5 rounded-full text-sm font-bold shadow-sm ${p.is_completed ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-amber-100 text-amber-700 border border-amber-200"}`}
                        >
                          {p.is_completed
                            ? "✓ Sonuçlandı"
                            : "⏱ Sonuç Bekleniyor"}
                        </span>
                      </div>
                    </div>

                    {/* Legs - alt alta dizili at numaraları */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 pl-4">
                      {p.legs &&
                        p.legs.map((leg, i) => (
                          <div
                            key={i}
                            className="bg-gray-50 border border-gray-100 rounded-2xl p-3 transition-colors hover:bg-emerald-50"
                          >
                            <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">
                              {leg.leg_number}. Ayak
                            </div>
                            {renderHorseBadges(leg.predictions)}
                            {leg.winner_horse > 0 && (
                              <div className="mt-2 flex items-center gap-1">
                                <span className="text-xs text-gray-400">
                                  Kazanan:
                                </span>
                                <span className="w-6 h-6 flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold rounded-full text-xs border border-indigo-200">
                                  {leg.winner_horse}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Program View */}
        {view === "program" && renderProgram()}
      </div>
    </div>
  );
}

export default App;
