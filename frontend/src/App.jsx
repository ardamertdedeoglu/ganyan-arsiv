import { useState, useEffect } from "react";
import "./style.css";
import {
  SavePrediction,
  GetPredictions,
  DeletePrediction,
  GetDailyPrograms,
  CheckForUpdate,
  PerformUpdate,
  GetAppVersion,
} from "../wailsjs/go/main/App";

function App() {
  const [view, setView] = useState("list"); // 'list' | 'form' | 'program'
  const [predictions, setPredictions] = useState([]);

  // Update state
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [city, setCity] = useState("İstanbul");
  const [raceTime, setRaceTime] = useState("18:00");
  const [legs, setLegs] = useState([
    { leg_number: 1, predictions: "" },
    { leg_number: 2, predictions: "" },
    { leg_number: 3, predictions: "" },
    { leg_number: 4, predictions: "" },
    { leg_number: 5, predictions: "" },
    { leg_number: 6, predictions: "" },
  ]);

  // Program state
  const [programDate, setProgramDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [programs, setPrograms] = useState([]);
  const [loadingProgram, setLoadingProgram] = useState(false);
  const [selectedProgramCity, setSelectedProgramCity] = useState(null);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);

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
          // Update succeeded
          setUpdating(false);
        } else {
          // Update failed but still available
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
    GetDailyPrograms(dateStr)
      .then((data) => {
        setPrograms(data || []);
        if (data && data.length > 0) {
          setSelectedProgramCity(data[0].city);
        }
      })
      .catch((err) => {
        alert("Programlar getirilirken hata oluştu: " + err);
      })
      .finally(() => {
        setLoadingProgram(false);
      });
  }

  function handleLegChange(index, value) {
    const newLegs = [...legs];
    const val = value.replace(/[^0-9, ]/g, ""); // Sadece sayı, virgül ve boşluk
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
      race_time: raceTime,
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

  // At numaralarını daire içinde göstermek için yardımcı fonksiyon
  const renderHorseBadges = (predictions) => {
    if (!predictions || predictions.length === 0)
      return <span className="text-gray-400">-</span>;
    return (
      <div className="flex flex-wrap gap-2 justify-start mt-2">
        {predictions.map((p, idx) => (
          <div
            key={idx}
            className="w-10 h-10 flex items-center justify-center bg-white border-2 border-emerald-500 text-emerald-700 font-bold rounded-full shadow-sm"
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
                            <span>
                              {race.race_name.split(":")[0] || `${i + 1}. Koşu`}
                            </span>
                            <span
                              className={`text-xs ${selectedRaceIndex === i ? "text-emerald-300" : "text-slate-400"}`}
                            >
                              {race.time}
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
                          <h3 className="font-bold text-xl">
                            {selectedRace.race_name}
                          </h3>
                          <div className="text-sm text-slate-300 flex items-center gap-2 mt-1.5">
                            <span>⏱️ {selectedRace.time}</span>
                            <span>•</span>
                            <span className="font-semibold text-emerald-300">
                              {selectedRace.condition}
                            </span>
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
                                        <span
                                          className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono text-xs font-bold tracking-wider"
                                          title="Son 6 Yarış / Derece"
                                        >
                                          {horse.last6}
                                        </span>
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

  return (
    <div className="min-h-screen bg-gray-50 text-left font-sans py-8">
      {/* Update Notification Banner */}
      {updateInfo && updateInfo.updateAvailable && !updateDismissed && (
        <div className="fixed top-0 left-0 right-0 z-50 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-3 flex items-center justify-center gap-4 shadow-lg">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="font-semibold text-sm">
                Yeni sürüm mevcut: <span className="font-bold">{updateInfo.latestVersion}</span>
                <span className="text-emerald-200 ml-1">(mevcut: {updateInfo.currentVersion})</span>
              </span>
            </div>
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="bg-white text-emerald-700 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {updating ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Update Success Banner */}
      {updateInfo && !updateInfo.updateAvailable && updateInfo.message && updateInfo.message.includes("başarılı") && (
        <div className="fixed top-0 left-0 right-0 z-50 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 flex items-center justify-center gap-4 shadow-lg">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
          updateInfo && (updateInfo.updateAvailable && !updateDismissed || updateInfo.message?.includes("başarılı")) ? "pt-12" : ""
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
                <span className="text-xs text-gray-400 font-medium">{appVersion}</span>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 bg-gray-50 p-6 rounded-2xl border border-gray-100">
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
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                    Saat
                  </label>
                  <input
                    type="time"
                    value={raceTime}
                    onChange={(e) => setRaceTime(e.target.value)}
                    required
                    className="w-full bg-white border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                  />
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

                    <button
                      onClick={() => handleDelete(p.id)}
                      className="absolute top-6 right-6 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 p-2 rounded-full transition-colors opacity-0 group-hover:opacity-100"
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

                    <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6 pr-12 pl-4">
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
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            {p.race_time}
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pl-4">
                      {p.legs &&
                        p.legs.map((leg, i) => (
                          <div
                            key={i}
                            className="bg-gray-50 border border-gray-100 rounded-2xl p-4 transition-colors hover:bg-emerald-50"
                          >
                            <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">
                              {leg.leg_number}. Ayak
                            </div>
                            {renderHorseBadges(leg.predictions)}
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
