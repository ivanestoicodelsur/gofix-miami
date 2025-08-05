document.addEventListener('DOMContentLoaded', function() {
  // Form submission
  const contactForm = document.getElementById('contactForm');
  contactForm.addEventListener('submit', function(e) {
    e.preventDefault();
    alert('¡Gracias por tu solicitud! Nos pondremos en contacto contigo lo antes posible.');
    contactForm.reset();
  });

  // Smooth scrolling for navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelector(this.getAttribute('href')).scrollIntoView({
        behavior: 'smooth'
      });
    });
  });
});
