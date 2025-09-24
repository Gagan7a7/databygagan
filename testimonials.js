// Extracted from testimonials.html inline <script>

// Optimized Intersection Observer with reduced options for better performance
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target); // Stop observing once visible
        }
    });
}, observerOptions);

// Throttled scroll handler for better performance
let ticking = false;
function updateScrollEffects() {
    const scrollY = window.scrollY;
    const backToTop = document.getElementById('back-to-top');
    
    if (scrollY > 300) {
        backToTop?.classList.add('visible');
    } else {
        backToTop?.classList.remove('visible');
    }
    
    ticking = false;
}

// Load testimonials with error handling
async function loadTestimonials() {
    const grid = document.getElementById('testimonials-grid');
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('empty-state');

    try {
        const response = await fetch('/api/testimonials');
        if (!response.ok) throw new Error('Network response was not ok');
        const testimonials = await response.json();

        loading.style.display = 'none';

        if (!testimonials || testimonials.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();

        testimonials.forEach(t => {
            const card = document.createElement('div');
            card.className = 'testimonial-card';
            
            let cardHTML = '';
            if (t.featured) {
                cardHTML += '<span class="featured-badge"><i class="fas fa-star"></i> Featured</span>';
            }

            let roleText = [t.clientRole, t.clientCompany, t.clientLocation]
                .filter(Boolean)
                .join(' • ');

            cardHTML += `
                <div class="client-info">
                    <div class="client-avatar">${t.clientName?.charAt(0) || 'C'}</div>
                    <div class="client-details">
                        <h2 class="client-name">${t.clientName || 'Client'}</h2>
                        <div class="client-role">${roleText || 'Client'}</div>
                    </div>
                </div>
                <blockquote class="testimonial-text">${t.testimonialText || 'No testimonial text provided'}</blockquote>
                <div class="testimonial-meta">
                    ${t.show_date === true ? `
                    <div class="testimonial-date">
                        <i class="far fa-calendar me-2"></i>
                        ${new Date(t.dateAdded).toLocaleDateString()}
                    </div>
                    ` : ''}
                    <div class="testimonial-category">${t.category || 'General'}</div>
                </div>
                ${t.keyHighlights && t.keyHighlights.length > 0 ? `
                    <div class="key-highlights">
                        ${t.keyHighlights.map(h => `
                            <span class="highlight-tag">${h}</span>
                        `).join('')}
                    </div>
                ` : ''}
            `;

            card.innerHTML = cardHTML;
            fragment.appendChild(card);
            observer.observe(card);
        });

        grid.appendChild(fragment);
    } catch (error) {
        console.error('Error loading testimonials:', error);
        loading.style.display = 'none';
        emptyState.style.display = 'block';
    }
}

// Optimized hover management for testimonial cards
function initTestimonialHover() {
    const grid = document.getElementById('testimonials-grid');
    if (!grid) return;

    // Only add hover functionality for devices that can hover
    if (window.matchMedia('(hover: hover)').matches) {
        grid.addEventListener('mouseenter', (e) => {
            if (e.target.classList.contains('testimonial-card')) {
                grid.classList.add('has-hovered-card');
                e.target.classList.add('is-hovered');
            }
        }, true);

        grid.addEventListener('mouseleave', (e) => {
            if (e.target.classList.contains('testimonial-card')) {
                grid.classList.remove('has-hovered-card');
                e.target.classList.remove('is-hovered');
                
                // Remove is-hovered from all cards to reset state
                grid.querySelectorAll('.testimonial-card').forEach(card => {
                    card.classList.remove('is-hovered');
                });
            }
        }, true);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    loadTestimonials();
    initTestimonialHover();
    
    // Optimized scroll listener
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateScrollEffects);
            ticking = true;
        }
    }, { passive: true });

    // Back to top click handler
    const backToTop = document.getElementById('back-to-top');
    backToTop?.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
});

// Reduce motion for users who prefer it
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.style.scrollBehavior = 'auto';
}
