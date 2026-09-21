const form = document.getElementById('inquiryForm');
const status = document.getElementById('formStatus');
document.getElementById('year').textContent = new Date().getFullYear();
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.className = 'form-status';
  status.textContent = 'भेजा जा रहा है…';
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch('/api/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'कुछ समस्या हुई।');
    status.className = 'form-status success';
    status.textContent = `${result.message} ID: ${result.inquiryId}`;
    form.reset();
  } catch (error) {
    status.className = 'form-status error';
    status.textContent = error.message || 'कृपया दोबारा प्रयास करें।';
  }
});
