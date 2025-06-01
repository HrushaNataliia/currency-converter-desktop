const fromSelect = document.getElementById('fromCurrency');
const toSelect = document.getElementById('toCurrency');
const amountInput = document.getElementById('amount');
const convertBtn = document.getElementById('convertBtn');
const resultElement = document.getElementById('result');
const historyList = document.getElementById('history');

let exchangeRates = {};

const primaryApiUrl = window.env?.PRIMARY_API_URL;
const fallbackApiUrl = window.env?.FALLBACK_API_URL;

async function fetchCurrencies() {
    try {
        let data = await tryFetchFromPrimaryAPI();

        if (!data) {
            console.log('Primary API failed, trying fallback API...');
            data = await tryFetchFromFallbackAPI();
        }

        if (!data) {
            throw new Error('Both APIs failed to provide data');
        }

        exchangeRates = data.rates;
        const currencies = Object.keys(data.rates);

        fromSelect.innerHTML = '';
        toSelect.innerHTML = '';

        currencies.forEach(currency => {
            fromSelect.add(new Option(currency, currency));
            toSelect.add(new Option(currency, currency));
        });

        fromSelect.value = 'USD';
        toSelect.value = 'EUR';

        resultElement.textContent = 'Валюти завантажено. Введіть суму для конвертації.';

    } catch (err) {
        console.error('Error fetching currencies:', err);
        resultElement.textContent = 'Помилка завантаження валют: ' + err.message;

        loadFallbackCurrencies();
    }
}

async function tryFetchFromPrimaryAPI() {
    try {
        const url = `${primaryApiUrl}/latest`;
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Primary API HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log('Primary API Response:', data);

        if (data.rates) {
            return { rates: data.rates };
        } else if (data.base && data.date && Object.keys(data).length > 2) {
            const rates = { ...data };
            delete rates.base;
            delete rates.date;
            delete rates.success;
            return { rates: rates };
        } else {
            return null;
        }
    } catch (error) {
        console.error('Primary API error:', error);
        return null;
    }
}

async function tryFetchFromFallbackAPI() {
    try {
        const url = `${fallbackApiUrl}/latest/USD`;
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Fallback API HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log('Fallback API Response:', data);

        if (data.rates) {
            const rates = { USD: 1, ...data.rates };
            return { rates: rates };
        }

        return null;
    } catch (error) {
        console.error('Fallback API error:', error);
        return null;
    }
}

function loadFallbackCurrencies() {
    const fallbackCurrencies = ['USD', 'EUR', 'UAH', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'PLN'];

    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';

    fallbackCurrencies.forEach(currency => {
        fromSelect.add(new Option(currency, currency));
        toSelect.add(new Option(currency, currency));
    });

    fromSelect.value = 'USD';
    toSelect.value = 'EUR';

    resultElement.textContent = 'Завантажено офлайн валюти. Конвертація може бути неточною.';
}

async function convertCurrency() {
    const amount = parseFloat(amountInput.value);
    const fromCurrency = fromSelect.value;
    const toCurrency = toSelect.value;

    if (!amount || amount <= 0) {
        resultElement.textContent = 'Будь ласка, введіть коректну суму';
        return;
    }

    if (!fromCurrency || !toCurrency) {
        resultElement.textContent = 'Будь ласка, оберіть валюти';
        return;
    }

    try {
        resultElement.textContent = 'Конвертація...';

        let convertedAmount;
        let rate;

        const primaryResult = await tryPrimaryConversion(amount, fromCurrency, toCurrency);

        if (primaryResult.success) {
            convertedAmount = primaryResult.result;
            rate = primaryResult.rate;
        } else {
            const fallbackResult = await tryFallbackConversion(amount, fromCurrency, toCurrency);

            if (fallbackResult.success) {
                convertedAmount = fallbackResult.result;
                rate = fallbackResult.rate;
            } else {
                throw new Error('Не вдалося отримати курс обміну');
            }
        }

        resultElement.innerHTML = `
            <strong>${amount} ${fromCurrency} = ${convertedAmount.toFixed(2)} ${toCurrency}</strong>
            <br>
            <small>Курс: 1 ${fromCurrency} = ${rate ? rate.toFixed(4) : 'N/A'} ${toCurrency}</small>
        `;

        addToHistory(amount, fromCurrency, convertedAmount, toCurrency, rate);

    } catch (err) {
        console.error('Conversion error:', err);
        resultElement.textContent = 'Помилка конвертації: ' + err.message;
    }
}

async function tryPrimaryConversion(amount, fromCurrency, toCurrency) {
    try {
        const url = `${primaryApiUrl}/convert?from=${fromCurrency}&to=${toCurrency}&amount=${amount}`;
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();

            if (typeof data.result === 'number' && !isNaN(data.result)) {
                return {
                    success: true,
                    result: data.result,
                    rate: data.info && data.info.rate ? data.info.rate : null
                };
            }
        }

        return { success: false };
    } catch (error) {
        console.error('Primary conversion error:', error);
        return { success: false };
    }
}

async function tryFallbackConversion(amount, fromCurrency, toCurrency) {
    try {
        if (exchangeRates && Object.keys(exchangeRates).length > 0) {
            const result = convertWithCachedRates(amount, fromCurrency, toCurrency);
            if (result.success) {
                return result;
            }
        }

        const url = `${fallbackApiUrl}/latest/${fromCurrency}`;
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();

            if (data.rates && data.rates[toCurrency]) {
                const rate = data.rates[toCurrency];
                const convertedAmount = amount * rate;

                return {
                    success: true,
                    result: convertedAmount,
                    rate: rate
                };
            }
        }

        return { success: false };
    } catch (error) {
        console.error('Fallback conversion error:', error);
        return { success: false };
    }
}

function convertWithCachedRates(amount, fromCurrency, toCurrency) {
    try {
        if (!exchangeRates[fromCurrency] || !exchangeRates[toCurrency]) {
            return { success: false };
        }

        const usdAmount = fromCurrency === 'USD' ? amount : amount / exchangeRates[fromCurrency];
        const convertedAmount = toCurrency === 'USD' ? usdAmount : usdAmount * exchangeRates[toCurrency];
        const rate = toCurrency === 'USD' ? (1 / exchangeRates[fromCurrency]) : (exchangeRates[toCurrency] / exchangeRates[fromCurrency]);

        return {
            success: true,
            result: convertedAmount,
            rate: rate
        };
    } catch (error) {
        console.error('Cached conversion error:', error);
        return { success: false };
    }
}

function addToHistory(fromAmount, fromCurrency, toAmount, toCurrency, rate) {
    const historyItem = document.createElement('li');
    const timestamp = new Date().toLocaleString('uk-UA');

    historyItem.innerHTML = `
        <div>
            ${fromAmount} ${fromCurrency} → ${toAmount.toFixed(2)} ${toCurrency}
            <br>
            <small>Курс: ${rate?.toFixed(4) || 'N/A'} | ${timestamp}</small>
        </div>
    `;

    historyItem.style.marginBottom = '10px';
    historyItem.style.padding = '8px';
    historyItem.style.backgroundColor = '#f5f5f5';
    historyItem.style.borderRadius = '4px';

    historyList.insertBefore(historyItem, historyList.firstChild);

    while (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild);
    }
}

convertBtn.addEventListener('click', convertCurrency);

amountInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        convertCurrency();
    }
});

fromSelect.addEventListener('change', () => {
    if (amountInput.value) {
        convertCurrency();
    }
});

toSelect.addEventListener('change', () => {
    if (amountInput.value) {
        convertCurrency();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, fetching currencies...');
    fetchCurrencies();
});