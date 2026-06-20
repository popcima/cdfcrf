/**
 * AdBlueMedia Content Locker
 * Fetches offers and monitors lead completion
 */

(function() {
    'use strict';
    
    // Configuration loaded from .env.js file
    // If .env.js is not loaded, use default values
    const CONFIG = window.ADBLUE_CONFIG || {
        userId: '',
        apiKey: '',
        offerFeedUrl: 'https://d1y3y09sav47f5.cloudfront.net/public/offers/feed.php',
        checkLeadsUrl: 'https://d1y3y09sav47f5.cloudfront.net/public/external/check2.php',
        numOffers: 3,
        requiredOffers: 1,
        checkInterval: 15000,
        testing: 0
    };
    
    // Validate that API credentials are loaded
    if (!CONFIG.userId || !CONFIG.apiKey) {
        console.error('AdBlueMedia API credentials not found. Please ensure .env.js is loaded before this script.');
    }
    
    let lockerInstance = null;
    let checkIntervalId = null;
    let isUnlocked = false;
    let completedOfferIds = [];
    
    /**
     * AdBlueMedia Content Locker Class
     */
    class AdBlueMediaLocker {
        constructor(options = {}) {
            this.config = { ...CONFIG, ...options };
            this.overlay = null;
            this.offersContainer = null;
            this.loadingElement = null;
            this.errorElement = null;
            this.onUnlockCallback = null;
            
            this.init();
        }
        
        /**
         * Initialize the locker
         */
        init() {
            this.createLockerHTML();
            this.attachEventListeners();
            this.loadOffers();
            this.startLeadChecking();
        }
        
        /**
         * Create and inject locker HTML
         */
        createLockerHTML() {
            // Check if locker HTML already exists
            let overlay = document.getElementById('adblue-locker-overlay');
            if (!overlay) {
                // Load HTML from external file or use inline
                overlay = document.createElement('div');
                overlay.id = 'adblue-locker-overlay';
                overlay.className = 'adblue-locker-overlay';
                overlay.innerHTML = this.getLockerHTML();
                document.body.appendChild(overlay);
            }
            
            this.overlay = overlay;
            this.offersContainer = document.getElementById('offers-container');
            this.loadingElement = document.getElementById('offers-loading');
            this.errorElement = document.getElementById('offers-error');
            
            // Add content image to locker
            this.addContentImage();
            
            // Update title with movie/show name
            this.updateTitleWithContentName();
        }
        
        /**
         * Update title with movie/show name
         */
        updateTitleWithContentName() {
            let contentTitle = null;
            
            // Method 1: Get from #w-info .name
            const nameElement = document.querySelector('#w-info .name, #w-info h1[itemprop="name"], #w-info .name[itemprop="name"]');
            if (nameElement) {
                contentTitle = nameElement.textContent.trim();
            }
            
            // Method 2: Get from currentSeries
            if (!contentTitle && window.currentSeries) {
                if (window.currentSeries.title) {
                    contentTitle = window.currentSeries.title;
                } else if (window.currentSeries.name) {
                    contentTitle = window.currentSeries.name;
                }
            }
            
            // Method 3: Get from page title or any h1
            if (!contentTitle) {
                const h1 = document.querySelector('h1, [itemprop="name"]');
                if (h1) {
                    contentTitle = h1.textContent.trim();
                }
            }
            
            // Update title if we found a content name
            if (contentTitle) {
                const titleElement = document.getElementById('adblue-locker-title');
                if (titleElement) {
                    titleElement.innerHTML = `Complete one offer below to help us avoid copyright issues, after completion you'll be able to continue watching <span class="content-name">${this.escapeHtml(contentTitle)}</span>.`;
                }
            }
        }
        
        /**
         * Add movie/show poster image to locker
         */
        addContentImage() {
            // Try to get poster image from various sources
            let contentImage = null;
            
            // Method 1: Check for poster in #w-info section
            const posterImg = document.querySelector('#w-info .poster img, #w-info .poster img[itemprop="image"]');
            if (posterImg && posterImg.src) {
                contentImage = posterImg.src;
            }
            
            // Method 2: Check for poster in video player
            if (!contentImage) {
                const videoPoster = document.querySelector('#my-video[poster], video[poster]');
                if (videoPoster && videoPoster.getAttribute('poster')) {
                    contentImage = videoPoster.getAttribute('poster');
                }
            }
            
            // Method 3: Check for poster in currentSeries data (if available)
            if (!contentImage && window.currentSeries) {
                if (window.currentSeries.poster) {
                    contentImage = window.currentSeries.poster;
                } else if (window.currentSeries.thumbnail) {
                    contentImage = window.currentSeries.thumbnail;
                }
            }
            
            // Method 4: Check for any image with poster/thumbnail in class/id
            if (!contentImage) {
                const img = document.querySelector('img[src*="poster"], img[src*="thumbnail"], .poster img, .thumbnail img');
                if (img && img.src) {
                    contentImage = img.src;
                }
            }
            
            // If we found an image, add it to the locker icon
            if (contentImage) {
                const backdrop = this.overlay.querySelector('.adblue-locker-backdrop');
                const posterContainer = this.overlay.querySelector('#poster-container');
                
                if (backdrop) {
                    // Add background image to backdrop with very subtle effect
                    backdrop.style.backgroundImage = `url(${this.escapeHtml(contentImage)})`;
                    backdrop.style.backgroundSize = 'cover';
                    backdrop.style.backgroundPosition = 'center';
                    backdrop.style.opacity = '0.12';
                }
                
                // Add poster image to the icon container (replaces lock icon area)
                if (posterContainer) {
                    posterContainer.innerHTML = `<img src="${this.escapeHtml(contentImage)}" alt="Content preview">`;
                }
            }
        }
        
        /**
         * Get locker HTML template
         */
        getLockerHTML() {
            return `
                <div class="adblue-locker-modal">
                    <div class="adblue-locker-backdrop"></div>
                    
                    <div class="adblue-locker-header">
                        <div class="adblue-locker-icon" id="adblue-locker-icon">
                            <div class="poster-container" id="poster-container">
                                <!-- Poster image will be inserted here -->
                            </div>
                            <div class="lock-overlay">
                                <div class="lock-animation">
                                    <i class="bi bi-lock-fill"></i>
                                </div>
                            </div>
                            <div class="loading-bubble"></div>
                        </div>
                        <h2 class="adblue-locker-title" id="adblue-locker-title">Complete one offer below to help us avoid copyright issues, after completion you'll be able to continue watching.</h2>
                    </div>
                    
                    <div class="adblue-locker-content">
                        <div class="adblue-locker-offers-container">
                            
                            <div class="offers-loading" id="offers-loading">
                                <div class="loading-spinner"></div>
                            </div>
                            <div id="offers-container" class="offers-grid">
                                <!-- Offers will be loaded here dynamically -->
                            </div>
                            <div id="offers-error" class="offers-error" style="display: none;">
                                <i class="bi bi-exclamation-triangle"></i>
                                <p>Unable to load offers. Please refresh.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="adblue-locker-footer">
                        <p class="footer-note">
                            <i class="bi bi-shield-check"></i>
                            Verified & secure
                        </p>
                    </div>
                </div>
            `;
        }
        
        /**
         * Attach event listeners
         */
        attachEventListeners() {
            // Prevent closing by clicking outside
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    // Optionally prevent closing
                    // e.stopPropagation();
                }
            });
        }
        
        /**
         * Show the locker
         */
        show() {
            if (this.overlay) {
                this.overlay.style.display = 'flex';
                document.body.style.overflow = 'hidden';
            }
        }
        
        /**
         * Hide the locker
         */
        hide() {
            if (this.overlay) {
                this.overlay.classList.add('unlocking');
                setTimeout(() => {
                    this.overlay.style.display = 'none';
                    document.body.style.overflow = '';
                    if (this.onUnlockCallback) {
                        this.onUnlockCallback();
                    }
                }, 500);
            }
        }
        
        /**
         * Load offers from AdBlueMedia API
         */
        loadOffers() {
            if (!this.offersContainer) return;
            
            // Show loading
            if (this.loadingElement) {
                this.loadingElement.style.display = 'flex';
            }
            if (this.errorElement) {
                this.errorElement.style.display = 'none';
            }
            
            // Build API URL
            const url = this.buildOfferFeedUrl();
            
            // Use JSONP for cross-origin request
            this.fetchOffersJSONP(url, (offers) => {
                this.handleOffersResponse(offers);
            });
        }
        
        /**
         * Build offer feed URL
         */
        buildOfferFeedUrl() {
            const params = new URLSearchParams({
                user_id: this.config.userId,
                api_key: this.config.apiKey,
                s1: '',
                s2: ''
            });
            
            return `${this.config.offerFeedUrl}?${params.toString()}`;
        }
        
        /**
         * Fetch offers using JSONP
         */
        fetchOffersJSONP(url, callback) {
            // Create callback function
            const callbackName = 'adblue_callback_' + Date.now();
            window[callbackName] = (data) => {
                delete window[callbackName];
                document.body.removeChild(script);
                callback(data);
            };
            
            // Create script tag
            const script = document.createElement('script');
            script.src = url + '&callback=' + callbackName;
            script.onerror = () => {
                delete window[callbackName];
                document.body.removeChild(script);
                this.handleOffersError();
            };
            
            document.body.appendChild(script);
            
            // Timeout after 10 seconds
            setTimeout(() => {
                if (window[callbackName]) {
                    delete window[callbackName];
                    if (script.parentNode) {
                        document.body.removeChild(script);
                    }
                    this.handleOffersError();
                }
            }, 10000);
        }
        
        /**
         * Handle offers response
         */
        handleOffersResponse(offers) {
            // Hide loading
            if (this.loadingElement) {
                this.loadingElement.style.display = 'none';
            }
            
            if (!offers || !Array.isArray(offers) || offers.length === 0) {
                this.handleOffersError();
                return;
            }
            
            // Log first offer to see available fields (for debugging)
            if (offers.length > 0) {
                console.log('AdBlueMedia Offer Sample:', offers[0]);
                console.log('Available offer fields:', Object.keys(offers[0]));
            }
            
            // Limit number of offers (3 max)
            const displayOffers = offers.slice(0, this.config.numOffers);
            
            
            // Render offers
            this.renderOffers(displayOffers);
        }
        
        /**
         * Render offers to DOM
         */
        renderOffers(offers) {
            if (!this.offersContainer) return;
            
            this.offersContainer.innerHTML = offers.map((offer, index) => {
                const anchor = offer.anchor || offer.title || `Offer ${index + 1}`;
                const url = offer.url || '#';
                const conversion = offer.conversion || '';
                
                // Try multiple common field names for images
                const thumbnail = offer.thumbnail || 
                                 offer.image || 
                                 offer.img || 
                                 offer.thumbnail_url ||
                                 offer.image_url ||
                                 offer.icon ||
                                 offer.icon_url ||
                                 offer.picture ||
                                 offer.photo ||
                                 '';
                
                const requirement = offer.requirement || offer.description || offer.conversion || 'Complete this offer';
                const offerId = offer.offer_id || offer.id || index;
                
                return `
                    <a href="${this.escapeHtml(url)}" 
                       target="_blank" 
                       rel="noopener noreferrer"
                       class="offer-card" 
                       data-offer-id="${offerId}"
                       title="${this.escapeHtml(conversion)}">
                        <div class="offer-content">
                            <div class="offer-info">
                                <div class="offer-title">${this.escapeHtml(anchor)}</div>
                                <div class="offer-requirement">${this.escapeHtml(requirement)}</div>
                            </div>
                        </div>
                    </a>
                `;
            }).join('');
            
            // Track offer clicks
            this.offersContainer.querySelectorAll('.offer-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    console.log('Offer clicked:', card.dataset.offerId);
                });
            });
        }
        
        /**
         * Handle offers error
         */
        handleOffersError() {
            if (this.loadingElement) {
                this.loadingElement.style.display = 'none';
            }
            if (this.errorElement) {
                this.errorElement.style.display = 'block';
            }
            if (this.offersContainer) {
                this.offersContainer.innerHTML = '';
            }
        }
        
        /**
         * Start checking for completed leads
         */
        startLeadChecking() {
            // Check immediately
            this.checkLeads();
            
            // Then check every interval
            checkIntervalId = setInterval(() => {
                if (!isUnlocked) {
                    this.checkLeads();
                }
            }, this.config.checkInterval);
        }
        
        /**
         * Stop checking for completed leads
         */
        stopLeadChecking() {
            if (checkIntervalId) {
                clearInterval(checkIntervalId);
                checkIntervalId = null;
            }
        }
        
        /**
         * Check for completed leads
         */
        checkLeads() {
            const url = this.buildCheckLeadsUrl();
            
            this.fetchCheckLeadsJSONP(url, (leads) => {
                this.handleLeadsResponse(leads);
            });
        }
        
        /**
         * Build check leads URL
         */
        buildCheckLeadsUrl() {
            const params = new URLSearchParams({
                testing: this.config.testing
            });
            
            return `${this.config.checkLeadsUrl}?${params.toString()}`;
        }
        
        /**
         * Fetch check leads using JSONP
         */
        fetchCheckLeadsJSONP(url, callback) {
            const callbackName = 'adblue_leads_callback_' + Date.now();
            window[callbackName] = (data) => {
                delete window[callbackName];
                if (script.parentNode) {
                    document.body.removeChild(script);
                }
                callback(data);
            };
            
            const script = document.createElement('script');
            script.src = url + '&callback=' + callbackName;
            script.onerror = () => {
                delete window[callbackName];
                if (script.parentNode) {
                    document.body.removeChild(script);
                }
            };
            
            document.body.appendChild(script);
        }
        
        /**
         * Handle leads response
         */
        handleLeadsResponse(leads) {
            if (!leads || !Array.isArray(leads) || leads.length === 0) {
                return;
            }
            
            const newCompletedIds = [];
            let totalEarnings = 0;
            
            leads.forEach(lead => {
                const offerId = parseInt(lead.offer_id);
                const points = parseFloat(lead.points || 0);
                
                if (offerId && !completedOfferIds.includes(offerId)) {
                    newCompletedIds.push(offerId);
                    completedOfferIds.push(offerId);
                    totalEarnings += points;
                    
                    console.log(`Lead completed: Offer ID ${offerId}, Earnings: $${(points / 100).toFixed(2)}`);
                }
            });
            
            if (newCompletedIds.length > 0) {
                const totalEarningsDollars = (totalEarnings / 100).toFixed(2);
                console.log(`SUMMARY: ${newCompletedIds.length} lead(s) completed, Total earnings: $${totalEarningsDollars}, Offer IDs: ${newCompletedIds.join(', ')}`);
                
                // Check if we have the required number of completed offers
                const requiredOffers = this.config.requiredOffers || 1;
                if (completedOfferIds.length >= requiredOffers) {
                    // Unlock the content
                    this.unlock();
                } else {
                    console.log(`Progress: ${completedOfferIds.length}/${requiredOffers} offer(s) completed. Need ${requiredOffers - completedOfferIds.length} more.`);
                }
            }
        }
        
        /**
         * Unlock the content
         */
        unlock() {
            if (isUnlocked) return;
            
            isUnlocked = true;
            
            // Small delay to show completion
            setTimeout(() => {
                this.stopLeadChecking();
                this.hide();
                console.log('Content unlocked!');
            }, 500);
        }
        
        /**
         * Set unlock callback
         */
        onUnlock(callback) {
            this.onUnlockCallback = callback;
        }
        
        /**
         * Escape HTML
         */
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }
    
    /**
     * Initialize locker
     */
    function initLocker(options) {
        if (lockerInstance) {
            return lockerInstance;
        }
        
        // Ensure CSS is loaded
        if (!document.getElementById('adblue-locker-css')) {
            const link = document.createElement('link');
            link.id = 'adblue-locker-css';
            link.rel = 'stylesheet';
            link.href = 'content-locker/adbluemedia-locker.css';
            document.head.appendChild(link);
        }
        
        lockerInstance = new AdBlueMediaLocker(options);
        return lockerInstance;
    }
    
    /**
     * Show locker
     */
    function showLocker(options) {
        const locker = initLocker(options);
        locker.show();
        return locker;
    }
    
    // Expose to global scope
    window.AdBlueMediaLocker = AdBlueMediaLocker;
    window.showAdBlueLocker = showLocker;
    window.initAdBlueLocker = initLocker;
    
    // Auto-initialize if data attribute is present
    if (document.body.dataset.autoShowLocker === 'true') {
        document.addEventListener('DOMContentLoaded', () => {
            showLocker();
        });
    }
    
})();

