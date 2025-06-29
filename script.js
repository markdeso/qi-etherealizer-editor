class QiEtherealizer {
    constructor() {
        this.midiAccess = null;
        this.midiOutput = null;
        this.midiChannel = 1;
        this.knobs = new Map();
        this.toggles = new Map();
        this.bypasses = new Map();
        this.availablePorts = new Map();
        this.customPresets = new Map();
        
        this.initMIDI();
        this.initControls();
        this.loadCustomPresets();
        this.initPresetSaving();
    }

    async initMIDI() {
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this.populateMIDIPorts();
            this.setupMIDIStateChange();
        } catch (error) {
            console.error('MIDI access failed:', error);
            this.updateMIDIStatus(false);
        }
    }

    setupMIDIStateChange() {
        if (this.midiAccess) {
            this.midiAccess.onstatechange = () => {
                this.populateMIDIPorts();
            };
        }
    }

    populateMIDIPorts() {
        const portSelect = document.getElementById('midiPortSelect');
        const refreshBtn = document.getElementById('refreshMidi');
        
        portSelect.innerHTML = '';
        this.availablePorts.clear();

        if (!this.midiAccess || this.midiAccess.outputs.size === 0) {
            portSelect.innerHTML = '<option value="">No MIDI Output Available</option>';
            this.midiOutput = null;
            this.updateMIDIStatus(false);
            return;
        }

        // Add default option
        portSelect.innerHTML = '<option value="">Select MIDI Output Port</option>';

        // Populate with available outputs
        for (let output of this.midiAccess.outputs.values()) {
            this.availablePorts.set(output.id, output);
            
            let displayName = this.getDisplayName(output.name);
            
            const option = document.createElement('option');
            option.value = output.id;
            option.textContent = displayName;
            portSelect.appendChild(option);
        }

        // Set up port selection handler
        portSelect.addEventListener('change', (e) => {
            this.selectMIDIPort(e.target.value);
        });

        // Set up refresh button
        refreshBtn.addEventListener('click', () => {
            this.populateMIDIPorts();
        });

        this.updateMIDIStatus(false); // Start as disconnected until port is selected
    }

    getDisplayName(portName) {
        // Return the actual port name - let users see exactly what's available
        // Only do minimal cleanup if needed
        if (!portName || portName.trim() === '') {
            return 'Unknown MIDI Port';
        }
        
        return portName.trim();
    }

    selectMIDIPort(portId) {
        if (portId && this.availablePorts.has(portId)) {
            this.midiOutput = this.availablePorts.get(portId);
            console.log(`Selected MIDI Output: ${this.midiOutput.name}`);
            this.updateMIDIStatus(true);
        } else {
            this.midiOutput = null;
            this.updateMIDIStatus(false);
        }
    }

    updateMIDIStatus(connected) {
        const statusElement = document.getElementById('midiStatus');
        if (connected && this.midiOutput) {
            statusElement.innerHTML = `<span class="midi-connected">MIDI: ${this.getDisplayName(this.midiOutput.name)}</span>`;
        } else {
            statusElement.innerHTML = '<span class="midi-disconnected">MIDI Disconnected</span>';
        }
    }

    sendMIDI(type, cc, value) {
        if (!this.midiOutput) {
            console.warn('No MIDI output selected');
            return;
        }

        let message;
        const channel = this.midiChannel - 1;

        switch (type) {
            case 'cc':
                message = [0xB0 + channel, cc, value];
                break;
            case 'pc':
                message = [0xC0 + channel, value];
                break;
            default:
                return;
        }

        try {
            this.midiOutput.send(message);
            console.log(`Sent MIDI ${type.toUpperCase()}: Channel ${this.midiChannel}, ${type === 'cc' ? `CC ${cc},` : ''} Value ${value} to ${this.midiOutput.name}`);
        } catch (error) {
            console.error('Failed to send MIDI:', error);
        }
    }

    initControls() {
        this.initKnobs();
        this.initToggles();
        this.initBypasses();
        this.initSelects();
    }

    initKnobs() {
        const knobElements = document.querySelectorAll('.knob');
        knobElements.forEach(knob => {
            const cc = parseInt(knob.dataset.cc);
            let value = parseInt(knob.dataset.value);
            let isDragging = false;
            let startY = 0;
            let startValue = 0;

            this.knobs.set(cc, value);
            this.updateKnobVisual(knob, value);

            const handleMouseDown = (e) => {
                isDragging = true;
                startY = e.clientY || e.touches[0].clientY;
                startValue = value;
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                document.addEventListener('touchmove', handleMouseMove);
                document.addEventListener('touchend', handleMouseUp);
                e.preventDefault();
            };

            const handleMouseMove = (e) => {
                if (!isDragging) return;
                
                const currentY = e.clientY || e.touches[0].clientY;
                const deltaY = startY - currentY;
                const sensitivity = 2;
                const newValue = Math.max(0, Math.min(127, startValue + Math.round(deltaY / sensitivity)));
                
                if (newValue !== value) {
                    value = newValue;
                    knob.dataset.value = value;
                    this.knobs.set(cc, value);
                    this.updateKnobVisual(knob, value);
                    this.sendMIDI('cc', cc, value);
                }
            };

            const handleMouseUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.removeEventListener('touchmove', handleMouseMove);
                document.removeEventListener('touchend', handleMouseUp);
            };

            knob.addEventListener('mousedown', handleMouseDown);
            knob.addEventListener('touchstart', handleMouseDown);
        });
    }

    updateKnobVisual(knob, value) {
        const angle = (value / 127) * 270 - 135;
        knob.style.transform = `rotate(${angle}deg)`;
        
        const valueDisplay = knob.parentElement.querySelector('.knob-value');
        if (valueDisplay) {
            valueDisplay.textContent = value;
        }
    }

    initToggles() {
        const toggleGroups = document.querySelectorAll('.toggle-group');
        toggleGroups.forEach(group => {
            const buttons = group.querySelectorAll('.toggle-btn');
            buttons.forEach(button => {
                button.addEventListener('click', () => {
                    const cc = parseInt(button.dataset.cc);
                    const value = parseInt(button.dataset.value);
                    
                    buttons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    
                    this.toggles.set(cc, value);
                    this.sendMIDI('cc', cc, value);
                });
            });
        });
    }

    initBypasses() {
        const bypassButtons = document.querySelectorAll('.bypass-btn');
        bypassButtons.forEach(button => {
            const cc = parseInt(button.dataset.cc);
            let bypassed = false;
            
            this.bypasses.set(cc, bypassed);
            
            button.addEventListener('click', () => {
                bypassed = !bypassed;
                this.bypasses.set(cc, bypassed);
                
                if (bypassed) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
                
                this.sendMIDI('cc', cc, bypassed ? 1 : 0);
            });
        });
    }

    initSelects() {
        // Initialize Bank 1 (Live + Colors)
        const presetSelectBank1 = document.getElementById('presetSelectBank1');
        presetSelectBank1.addEventListener('change', (e) => {
            const preset = parseInt(e.target.value);
            this.sendMIDI('pc', null, preset);
            this.clearOtherPresetSelections('presetSelectBank1');
        });

        // Initialize Bank 2 (Presets 4-32) - Custom presets
        const presetSelectBank2 = document.getElementById('presetSelectBank2');
        this.populateCustomPresets();
        presetSelectBank2.addEventListener('change', (e) => {
            if (e.target.value) {
                const preset = parseInt(e.target.value);
                this.loadPreset(preset);
                this.sendMIDI('pc', null, preset);
                this.clearOtherPresetSelections('presetSelectBank2');
            }
        });

        // Initialize Bank 3 (Presets 33-64)
        const presetSelectBank3 = document.getElementById('presetSelectBank3');
        for (let i = 33; i <= 64; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Preset ${i}`;
            presetSelectBank3.appendChild(option);
        }
        presetSelectBank3.addEventListener('change', (e) => {
            if (e.target.value) {
                const preset = parseInt(e.target.value);
                this.sendMIDI('pc', null, preset);
                this.clearOtherPresetSelections('presetSelectBank3');
            }
        });

        // Initialize Bank 4 (Presets 65-96)
        const presetSelectBank4 = document.getElementById('presetSelectBank4');
        for (let i = 65; i <= 96; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Preset ${i}`;
            presetSelectBank4.appendChild(option);
        }
        presetSelectBank4.addEventListener('change', (e) => {
            if (e.target.value) {
                const preset = parseInt(e.target.value);
                this.sendMIDI('pc', null, preset);
                this.clearOtherPresetSelections('presetSelectBank4');
            }
        });

        // Initialize Bank 5 (Presets 97-128)
        const presetSelectBank5 = document.getElementById('presetSelectBank5');
        for (let i = 97; i <= 128; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Preset ${i}`;
            presetSelectBank5.appendChild(option);
        }
        presetSelectBank5.addEventListener('change', (e) => {
            if (e.target.value) {
                const preset = parseInt(e.target.value);
                this.sendMIDI('pc', null, preset);
                this.clearOtherPresetSelections('presetSelectBank5');
            }
        });

        // MIDI Channel selection
        const channelSelect = document.getElementById('midiChannelSelect');
        channelSelect.value = this.midiChannel;
        channelSelect.addEventListener('change', (e) => {
            this.midiChannel = parseInt(e.target.value);
            console.log(`MIDI Channel changed to: ${this.midiChannel}`);
        });
    }

    loadCustomPresets() {
        try {
            const saved = localStorage.getItem('qiEtherealizer_customPresets');
            if (saved) {
                const presets = JSON.parse(saved);
                for (let [slot, presetData] of Object.entries(presets)) {
                    this.customPresets.set(parseInt(slot), presetData);
                }
            }
        } catch (error) {
            console.error('Error loading custom presets:', error);
        }
    }

    saveCustomPresets() {
        try {
            const presetsObj = {};
            for (let [slot, presetData] of this.customPresets.entries()) {
                presetsObj[slot] = presetData;
            }
            localStorage.setItem('qiEtherealizer_customPresets', JSON.stringify(presetsObj));
        } catch (error) {
            console.error('Error saving custom presets:', error);
        }
    }

    populateCustomPresets() {
        const presetSelectBank2 = document.getElementById('presetSelectBank2');
        
        // Clear existing options (except first)
        presetSelectBank2.innerHTML = '<option value="">Select Preset 4-32</option>';

        for (let i = 4; i <= 32; i++) {
            const option = document.createElement('option');
            option.value = i;
            
            if (this.customPresets.has(i)) {
                const preset = this.customPresets.get(i);
                const truncatedName = preset.name.length > 12 ? 
                    preset.name.substring(0, 12) + '...' : preset.name;
                option.textContent = `${i}: ${truncatedName}`;
            } else {
                option.textContent = `Preset ${i} (Empty)`;
            }
            presetSelectBank2.appendChild(option);
        }
    }

    getBankRange(bankId) {
        switch(bankId) {
            case 'bank2': return { start: 4, end: 32, name: 'Bank 4-32' };
            case 'bank3': return { start: 33, end: 64, name: 'Bank 33-64' };
            case 'bank4': return { start: 65, end: 96, name: 'Bank 65-96' };
            case 'bank5': return { start: 97, end: 128, name: 'Bank 97-128' };
            default: return null;
        }
    }

    populateSaveSlots(bankId) {
        const saveSlotSelect = document.getElementById('saveSlotSelect');
        const bankRange = this.getBankRange(bankId);
        
        if (!bankRange) {
            saveSlotSelect.innerHTML = '<option value="">Select bank first...</option>';
            saveSlotSelect.disabled = true;
            return;
        }

        saveSlotSelect.innerHTML = '<option value="">Select slot...</option>';
        saveSlotSelect.disabled = false;

        for (let i = bankRange.start; i <= bankRange.end; i++) {
            const option = document.createElement('option');
            option.value = i;
            
            if (this.customPresets.has(i)) {
                const preset = this.customPresets.get(i);
                const truncatedName = preset.name.length > 10 ? 
                    preset.name.substring(0, 10) + '...' : preset.name;
                option.textContent = `${i}: ${truncatedName} (Overwrite)`;
                option.style.color = '#FFA500'; // Orange for occupied slots
            } else {
                option.textContent = `Slot ${i} (Empty)`;
                option.style.color = '#40E0D0'; // Teal for empty slots
            }
            saveSlotSelect.appendChild(option);
        }
    }

    initPresetSaving() {
        const saveBtn = document.getElementById('savePresetBtn');
        const deleteBtn = document.getElementById('deletePresetBtn');
        const nameInput = document.getElementById('presetNameInput');
        const bankSelect = document.getElementById('saveBankSelect');
        const slotSelect = document.getElementById('saveSlotSelect');
        const presetSelectBank2 = document.getElementById('presetSelectBank2');

        // Bank selection handler
        bankSelect.addEventListener('change', (e) => {
            this.populateSaveSlots(e.target.value);
        });

        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            const bankId = bankSelect.value;
            const slot = parseInt(slotSelect.value);

            if (!name) {
                this.showNotification('Please enter a preset name', 'error');
                return;
            }

            if (!bankId) {
                this.showNotification('Please select a bank', 'error');
                return;
            }

            if (!slot) {
                this.showNotification('Please select a slot', 'error');
                return;
            }

            const bankRange = this.getBankRange(bankId);
            if (slot < bankRange.start || slot > bankRange.end) {
                this.showNotification(`Invalid slot for ${bankRange.name}`, 'error');
                return;
            }

            this.saveCurrentPreset(name, slot);
            nameInput.value = '';
            bankSelect.selectedIndex = 0;
            slotSelect.innerHTML = '<option value="">Select bank first...</option>';
            slotSelect.disabled = true;
        });

        deleteBtn.addEventListener('click', () => {
            const selectedBank2 = parseInt(presetSelectBank2.value);
            const selectedSaveSlot = parseInt(slotSelect.value);
            
            // Prioritize the save slot selection, fallback to bank2 selection
            const selectedSlot = selectedSaveSlot || selectedBank2;
            
            if (selectedSlot && selectedSlot >= 4) {
                if (this.customPresets.has(selectedSlot)) {
                    const preset = this.customPresets.get(selectedSlot);
                    // Show confirmation notification instead of confirm dialog
                    this.showDeleteConfirmation(selectedSlot, preset.name);
                } else {
                    this.showNotification('No preset found in that slot', 'error');
                }
            } else {
                this.showNotification('Please select a custom preset to delete', 'error');
            }
        });
    }

    showNotification(message, type = 'success') {
        // Remove existing notification if present
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        notification.innerHTML = `
            <div class="notification-content">${message}</div>
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
        `;

        // Add to document
        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOutUp 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    showDeleteConfirmation(slot, presetName) {
        // Remove existing notification if present
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create confirmation notification
        const notification = document.createElement('div');
        notification.className = 'notification warning';
        
        notification.innerHTML = `
            <div class="notification-content">Delete "${presetName}" from slot ${slot}?</div>
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
        `;

        // Add confirmation buttons
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Delete';
        confirmBtn.className = 'delete-btn';
        confirmBtn.style.cssText = 'padding: 5px 10px; margin-left: 10px; font-size: 0.8rem;';
        confirmBtn.onclick = () => {
            this.deletePreset(slot);
            notification.remove();
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding: 5px 10px; margin-left: 5px; font-size: 0.8rem;';
        cancelBtn.onclick = () => notification.remove();

        notification.appendChild(confirmBtn);
        notification.appendChild(cancelBtn);

        // Add to document
        document.body.appendChild(notification);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOutUp 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
            }
        }, 10000);
    }

    getCurrentSettings() {
        const settings = {
            knobs: {},
            toggles: {},
            bypasses: {}
        };

        // Capture knob values
        for (let [cc, value] of this.knobs.entries()) {
            settings.knobs[cc] = value;
        }

        // Capture toggle values
        for (let [cc, value] of this.toggles.entries()) {
            settings.toggles[cc] = value;
        }

        // Capture bypass states
        for (let [cc, value] of this.bypasses.entries()) {
            settings.bypasses[cc] = value;
        }

        return settings;
    }

    saveCurrentPreset(name, slot) {
        const settings = this.getCurrentSettings();
        const presetData = {
            name: name,
            slot: slot,
            settings: settings,
            created: new Date().toISOString()
        };

        this.customPresets.set(slot, presetData);
        this.saveCustomPresets();
        this.populateCustomPresets();
        
        console.log(`Saved preset "${name}" to slot ${slot}`);
        this.showNotification(`Preset "${name}" saved to slot ${slot}!`, 'success');
    }

    loadPreset(slot) {
        if (!this.customPresets.has(slot)) {
            console.warn(`No preset found in slot ${slot}`);
            return;
        }

        const presetData = this.customPresets.get(slot);
        const settings = presetData.settings;

        // Load knob values
        for (let [cc, value] of Object.entries(settings.knobs)) {
            const ccNum = parseInt(cc);
            this.knobs.set(ccNum, value);
            
            // Update visual
            const knobElement = document.querySelector(`[data-cc="${ccNum}"].knob`);
            if (knobElement) {
                knobElement.dataset.value = value;
                this.updateKnobVisual(knobElement, value);
            }

            // Send MIDI
            this.sendMIDI('cc', ccNum, value);
        }

        // Load toggle values
        for (let [cc, value] of Object.entries(settings.toggles)) {
            const ccNum = parseInt(cc);
            this.toggles.set(ccNum, value);
            
            // Update visual
            const toggleGroup = document.querySelector(`[data-cc="${ccNum}"]`).closest('.toggle-group');
            if (toggleGroup) {
                const buttons = toggleGroup.querySelectorAll('.toggle-btn');
                buttons.forEach(btn => btn.classList.remove('active'));
                const targetBtn = toggleGroup.querySelector(`[data-value="${value}"]`);
                if (targetBtn) targetBtn.classList.add('active');
            }

            // Send MIDI
            this.sendMIDI('cc', ccNum, value);
        }

        // Load bypass states
        for (let [cc, value] of Object.entries(settings.bypasses)) {
            const ccNum = parseInt(cc);
            this.bypasses.set(ccNum, value);
            
            // Update visual
            const bypassBtn = document.querySelector(`[data-cc="${ccNum}"].bypass-btn`);
            if (bypassBtn) {
                if (value) {
                    bypassBtn.classList.add('active');
                } else {
                    bypassBtn.classList.remove('active');
                }
            }

            // Send MIDI
            this.sendMIDI('cc', ccNum, value ? 1 : 0);
        }

        console.log(`Loaded preset "${presetData.name}" from slot ${slot}`);
    }

    deletePreset(slot) {
        if (this.customPresets.has(slot)) {
            const presetData = this.customPresets.get(slot);
            this.customPresets.delete(slot);
            this.saveCustomPresets();
            
            // Refresh all relevant dropdowns
            this.populateCustomPresets();
            
            // Refresh save slot dropdown if current bank contains this slot
            const bankSelect = document.getElementById('saveBankSelect');
            if (bankSelect.value) {
                this.populateSaveSlots(bankSelect.value);
            }
            
            // Clear selections
            const presetSelectBank2 = document.getElementById('presetSelectBank2');
            presetSelectBank2.selectedIndex = 0;
            
            console.log(`Deleted preset "${presetData.name}" from slot ${slot}`);
            this.showNotification(`Preset "${presetData.name}" deleted from slot ${slot}`, 'success');
        }
    }

    clearOtherPresetSelections(excludeId) {
        const presetSelects = [
            'presetSelectBank1', 
            'presetSelectBank2', 
            'presetSelectBank3', 
            'presetSelectBank4', 
            'presetSelectBank5'
        ];
        
        presetSelects.forEach(id => {
            if (id !== excludeId) {
                const select = document.getElementById(id);
                if (select) {
                    select.selectedIndex = 0;
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const editor = new QiEtherealizer();
    
    // Test notification system
    setTimeout(() => {
        editor.showNotification('Qi Etherealizer Editor loaded successfully!', 'success');
    }, 1000);
});