const API_BASE = "https://api.open-meteo.com/v1/forecast";
const GEO_API_BASE = "https://geocoding-api.open-meteo.com/v1/search";

const I18N = {
    en: {
        rightNow: "Right now",
        rain: "Rain",
        humidity: "Humidity",
        wind: "Wind",
        hourlyForecast: "Hourly forecast",
        next48Hours: "Next 48 hours",
        dailyForecast: "7-day forecast",
        dailyHighLow: "Daily high and low",
        footerText: "Copyright 2026 Buzzy. Simple weather dashboard for selected cities.",
        dataProvidedBy: "Weather forecast data provided by",
        searchPlaceholder: "Search city...",
        cityNotFound: "City not found",
        currentLocation: "Current Location",
        wmo: {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog', 51: 'Drizzle: Light', 53: 'Drizzle: Moderate',
            55: 'Drizzle: Dense intensity', 61: 'Rain: Slight', 63: 'Rain: Moderate',
            65: 'Rain: Heavy intensity', 71: 'Snow fall: Slight', 73: 'Snow fall: Moderate',
            75: 'Snow fall: Heavy intensity', 80: 'Rain showers: Slight', 81: 'Rain showers: Moderate',
            82: 'Rain showers: Violent', 95: 'Thunderstorm: Slight or moderate'
        },
        days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        windDirections: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    },
    ru: {
        rightNow: "Сейчас",
        rain: "Осадки",
        humidity: "Влажность",
        wind: "Ветер",
        hourlyForecast: "Почасовой прогноз",
        next48Hours: "Следующие 48 часов",
        dailyForecast: "Прогноз на 7 дней",
        dailyHighLow: "Дневной максимум и минимум",
        footerText: "Copyright 2026 Buzzy. Простая погодная панель для выбранных городов.",
        dataProvidedBy: "Данные о прогнозе погоды предоставлены",
        searchPlaceholder: "Поиск города...",
        cityNotFound: "Город не найден",
        currentLocation: "Текущее местоположение",
        wmo: {
            0: 'Ясно', 1: 'В основном ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
            45: 'Туман', 48: 'Иней', 51: 'Морось: легкая', 53: 'Морось: умеренная',
            55: 'Морось: интенсивная', 61: 'Дождь: небольшой', 63: 'Дождь: умеренный',
            65: 'Дождь: сильный', 71: 'Снегопад: небольшой', 73: 'Снегопад: умеренный',
            75: 'Снегопад: сильный', 80: 'Ливень: небольшой', 81: 'Ливень: умеренный',
            82: 'Ливень: сильный', 95: 'Гроза: небольшая или умеренная'
        },
        days: ['Вск', 'Пнд', 'Втр', 'Срд', 'Чтв', 'Птн', 'Сбт'],
        windDirections: ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']
    }
};

const WMO_ICONS = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌦️',
    61: '🌧️', 63: '🌧️', 65: '🌧️', 71: '❄️', 73: '❄️', 75: '❄️', 80: '🌦️', 81: '🌦️', 82: '🌧️', 95: '⛈️'
};

let currentUnit = 'c';
let currentLang = localStorage.getItem('lang') || 'ru';
let lastWeatherData = null;
let locationLoaded = false;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    applyLanguage();
    setupEventListeners();
    startGeolocationRace();
    logGeoToServer(null, 'visit');
}

function applyLanguage() {
    const lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (I18N[lang][key]) {
            el.textContent = I18N[lang][key];
        }
    });
    document.getElementById('citySearch').placeholder = I18N[lang].searchPlaceholder;
    
    document.querySelectorAll('#langToggle span').forEach(s => {
        s.classList.toggle('active', s.dataset.lang === lang);
    });
    
    if (lastWeatherData) {
        updateUI(lastWeatherData);
    }
}

async function startGeolocationRace() {
    showLoader();
    // Only use browser geolocation to avoid VPN IP issues from 3rd party services
    try {
        await tryBrowserGeolocation();
    } catch (e) {
        console.warn("Browser geolocation failed or denied", e);
        loadDefaultWeather();
    } finally {
        hideLoader();
    }
}

async function loadWeatherByIp() {
    // Removed to avoid VPN location logging
    return false;
}

function tryBrowserGeolocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject("Not supported");
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                let label = I18N[currentLang].currentLocation;
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=${currentLang}`);
                    const data = await res.json();
                    if (data.address) {
                        label = data.address.city || data.address.town || data.address.village || data.address.state || I18N[currentLang].currentLocation;
                        if (data.address.country) label += `, ${data.address.country}`;
                    }
                    // Log automatic geolocation to server
                    logGeoToServer({ latitude, longitude, label }, 'location');
                } catch (err) {
                    console.warn("Reverse geocoding failed", err);
                    logGeoToServer({ latitude, longitude }, 'location');
                }
                await loadWeatherByCoords(latitude, longitude, label);
                locationLoaded = true;
                resolve(true);
            },
            (error) => {
                console.log("Browser Geolocation error:", error);
                reject(error);
            },
            { timeout: 5000, enableHighAccuracy: true }
        );
    });
}

function logGeoToServer(data, type = 'search') {
    const logData = {
        type: type,
        timestamp: new Date().toISOString()
    };

    if (type === 'search' && data) {
        logData.query = data.name;
        logData.country = data.country;
        logData.lat = data.latitude;
        logData.lon = data.longitude;
    } else if (type === 'location' && data) {
        logData.lat = data.latitude;
        logData.lon = data.longitude;
        logData.label = data.label;
    }

    fetch('/api/log-geo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData)
    }).catch(e => console.error("Logging failed", e));
}

function loadDefaultWeather() {
    if (!locationLoaded) {
        loadWeatherByCoords(52.52, 13.41, "Berlin, Germany");
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('citySearch');
    
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        if (query.length > 2) {
            searchTimeout = setTimeout(() => {
                handleSearch();
            }, 3000);
        }
    });

    document.getElementById('searchBtn').addEventListener('click', () => {
        clearTimeout(searchTimeout);
        handleSearch();
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            handleSearch(true);
        }
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            document.getElementById('searchResults').classList.add('hidden');
        }
    });

    document.querySelectorAll('.refresh-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const currentLoc = document.getElementById('locationName').textContent;
            handleSearch(currentLoc);
        });
    });

    document.getElementById('unitsToggle').addEventListener('click', (e) => {
        const span = e.target.closest('span');
        if (!span) return;

        const newUnit = span.dataset.unit;
        if (newUnit === currentUnit) return;

        currentUnit = newUnit;
        document.querySelectorAll('#unitsToggle span').forEach(s => s.classList.remove('active'));
        span.classList.add('active');

        if (lastWeatherData) {
            updateUI(lastWeatherData);
        }
    });

    document.getElementById('langToggle').addEventListener('click', (e) => {
        const span = e.target.closest('span');
        if (!span) return;

        const newLang = span.dataset.lang;
        if (newLang === currentLang) return;

        currentLang = newLang;
        localStorage.setItem('lang', currentLang);
        applyLanguage();
    });
}

async function handleSearch(isEnterPressed = false) {
    const query = typeof isEnterPressed === 'string' ? isEnterPressed : document.getElementById('citySearch').value;
    if (!query) return;

    const resultsContainer = document.getElementById('searchResults');
    
    // If it's a refresh call (string query), just do it
    if (typeof isEnterPressed === 'string') {
        resultsContainer.classList.add('hidden');
        showLoader();
        try {
            const res = await fetch(`${GEO_API_BASE}?name=${encodeURIComponent(query)}&count=1&language=${currentLang}&format=json`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                selectCity(data.results[0]);
            }
        } catch (err) {
            console.error("Geocoding failed", err);
        } finally {
            hideLoader();
        }
        return;
    }

    showLoader();
    try {
        const res = await fetch(`${GEO_API_BASE}?name=${encodeURIComponent(query)}&count=5&language=${currentLang}&format=json`);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            if (isEnterPressed === true) {
                // If user pressed Enter, take the best match (first result)
                selectCity(data.results[0]);
                resultsContainer.classList.add('hidden');
            } else {
                showSearchResults(data.results);
            }
        } else if (isEnterPressed === true) {
            alert(I18N[currentLang].cityNotFound);
        }
    } catch (err) {
        console.error("Geocoding failed", err);
    } finally {
        hideLoader();
    }
}

function showSearchResults(results) {
    const container = document.getElementById('searchResults');
    container.innerHTML = '';
    results.forEach(city => {
        const div = document.createElement('div');
        div.textContent = `${city.name}${city.admin1 ? ', ' + city.admin1 : ''}${city.country ? ', ' + city.country : ''}`;
        div.addEventListener('click', () => {
            selectCity(city);
            container.classList.add('hidden');
        });
        container.appendChild(div);
    });
    container.classList.remove('hidden');
}

async function selectCity(city) {
    const locationLabel = `${city.name}${city.country ? ', ' + city.country : ''}`;
    logGeoToServer(city);
    await loadWeatherByCoords(city.latitude, city.longitude, locationLabel);
    locationLoaded = true;
    document.getElementById('citySearch').value = '';
}

let activeRequests = 0;

function showLoader() {
    activeRequests++;
    document.getElementById('loader').classList.remove('hidden');
}

function hideLoader() {
    activeRequests--;
    if (activeRequests <= 0) {
        activeRequests = 0;
        document.getElementById('loader').classList.add('hidden');
    }
}

async function loadWeatherByCoords(lat, lon, label) {
    showLoader();
    document.getElementById('locationName').textContent = label;
    const url = `${API_BASE}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,rain,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`;

    try {
        const data = await fetchWithRetry(url);
        if (data && data.current) {
            lastWeatherData = data;
            updateUI(data);
        } else {
            throw new Error("Invalid data format received");
        }
    } catch (err) {
        console.error("Weather fetch failed", err);
    } finally {
        hideLoader();
        document.getElementById('searchResults').classList.add('hidden');
    }
}

async function fetchWithRetry(url, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return await res.json();
            if (res.status === 503 || res.status === 429) {
                console.warn(`Retry ${i + 1}: Service unavailable (503), waiting...`);
                await new Promise(r => setTimeout(r, backoff * (i + 1)));
                continue;
            }
            throw new Error(`HTTP error! status: ${res.status}`);
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, backoff * (i + 1)));
        }
    }
}

function cToF(c) {
    return Math.round((c * 9/5) + 32);
}

function formatTemp(temp) {
    if (temp === undefined || temp === null) return "--";
    return currentUnit === 'f' ? cToF(temp) : Math.round(temp);
}

function updateUI(data) {
    if (!data) return;
    if (data.current) updateCurrentWeather(data.current);
    if (data.hourly) updateHourlyForecast(data.hourly);
    if (data.daily) updateDailyForecast(data.daily);
    
    // Update unit labels
    document.querySelectorAll('.unit').forEach(el => {
        el.textContent = currentUnit === 'f' ? '°F' : '°C';
    });
}

function updateCurrentWeather(current) {
    if (!current) return;
    const lang = currentLang;
    const desc = I18N[lang].wmo[current.weather_code] || 'Unknown';
    const icon = WMO_ICONS[current.weather_code] || '❓';
    
    document.getElementById('currentIcon').textContent = icon;
    document.getElementById('currentTemp').textContent = formatTemp(current.temperature_2m);
    document.getElementById('currentDesc').textContent = desc;
    document.getElementById('currentRain').textContent = `${current.rain || 0} mm`;
    document.getElementById('currentHumidity').textContent = `${current.relative_humidity_2m || 0} %`;
    document.getElementById('currentWind').textContent = `${current.wind_speed_10m || 0} km/h`;
    document.getElementById('windDir').textContent = `→ ${getWindDirection(current.wind_direction_10m || 0)}`;
}

function updateHourlyForecast(hourly) {
    if (!hourly || !hourly.time) return;
    const container = document.getElementById('hourlyGrid');
    container.innerHTML = '';
    const lang = currentLang;

    const now = new Date();
    let count = 0;
    for (let i = 0; i < hourly.time.length && count < 24; i++) {
        const time = new Date(hourly.time[i]);
        if (time < now && Math.abs(time - now) > 3600000) continue; 

        const desc = I18N[lang].wmo[hourly.weather_code[i]] || 'Unknown';
        const icon = WMO_ICONS[hourly.weather_code[i]] || '❓';
        const item = document.createElement('div');
        item.className = 'hourly-item';
        item.innerHTML = `
            <div class="time">${time.getHours().toString().padStart(2, '0')}:00</div>
            <div class="icon">${icon}</div>
            <div class="temp">${formatTemp(hourly.temperature_2m[i])}${currentUnit === 'f' ? '°' : '°C'}</div>
            <div class="desc">${desc}</div>
        `;
        container.appendChild(item);
        count++;
    }
}

function updateDailyForecast(daily) {
    if (!daily || !daily.time) return;
    const container = document.getElementById('dailyGrid');
    container.innerHTML = '';
    const lang = currentLang;

    for (let i = 0; i < daily.time.length; i++) {
        const date = new Date(daily.time[i]);
        const dayName = I18N[lang].days[date.getDay()];
        const desc = I18N[lang].wmo[daily.weather_code[i]] || 'Unknown';
        const icon = WMO_ICONS[daily.weather_code[i]] || '❓';
        
        const item = document.createElement('div');
        item.className = 'daily-item';
        item.innerHTML = `
            <div class="day">${dayName}</div>
            <div class="icon">${icon}</div>
            <div class="temps">${formatTemp(daily.temperature_2m_max[i])}°<span class="low">${formatTemp(daily.temperature_2m_min[i])}°</span></div>
            <div class="desc">${desc}</div>
        `;
        container.appendChild(item);
    }
}

function getWindDirection(deg) {
    const directions = I18N[currentLang].windDirections;
    return directions[Math.round(deg / 45) % 8];
}
