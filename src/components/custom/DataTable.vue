<script setup>
import { ref } from 'vue'

const props = defineProps({
  // The data array to display
  items: {
    type: Array,
    required: true
  },
  // Column definitions with headers and data accessors
  columns: {
    type: Array,
    required: true
  },
  // Whether to show striped rows
  striped: {
    type: Boolean,
    default: true
  },
  // Add props for row attributes and ref
  getRowAttributes: {
    type: Function,
    default: () => ({})
  },
  getRowRef: {
    type: Function,
    default: null
  }
})

// Add direct ref instead of prop
const scrollableWindow = ref(null)

// Emit events for actions
const emit = defineEmits(['row-click'])

// Simplify to just handle striping
const getRowClasses = (index) => ({
  'row-striped': props.striped && index % 2 === 1
})

// Expose the ref to parent
defineExpose({
  scrollableWindow
})
</script>

<template>
  <div class="data-table-container">
    <div class="scrollable-window" ref="scrollableWindow">
      <div class="container-fluid pb-1">
        <!-- Header Row -->
        <div class="row sticky-top header-row bg-white pb-2 pt-0 mb-2">
          <div class="col-12 d-flex flex-column align-items-stretch d-none d-xl-block">
            <!-- Render header-actions slot if provided, above the column labels -->
            <div class="p-2 align-self-end">
              <slot name="header-actions"></slot>
            </div>
            <div class="card border-0 flex-grow-1">
              <div class="card-body py-2">
                <div class="row d-none d-xl-flex">
                  <template v-for="column in columns" :key="column.key">
                    <div :class="column.class || 'col'"
                         v-if="column.header.tooltip"
                         data-bs-toggle="tooltip"
                         :data-bs-html="column.header.tooltipHtml"
                         :data-bs-title="column.header.tooltip">
                      {{ column.header.text }}
                      <i v-if="column.header.tooltip" class="bi bi-info-circle ms-1"></i>
                    </div>
                    <div v-else :class="column.class || 'col'">
                      {{ column.header.text }}
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Data Rows -->
        <div v-for="(item, index) in items" 
             :key="index" 
             class="row mb-2"
             :ref="el => props.getRowRef?.(el, item)"
             v-bind="getRowAttributes?.(item)"
             :class="getRowClasses(index)">
          <div class="col-12">
            <div class="card h-100" @click="$emit('row-click', item)">
              <div class="card-body py-2">
                <!-- Mobile Header Row (if needed) -->
                <slot name="mobile-header" :item="item" :index="index"></slot>

                <!-- Main Row Content -->
                <div class="row">
                  <!-- Render slot for complete customization if needed -->
                  <slot name="row" :item="item" :index="index">
                    <!-- Default row rendering -->
                    <template v-for="column in columns" :key="column.key">
                      <div :class="column.class || 'col-6 col-xl'">
                        <div class="data-label d-xl-none">{{ column.header.text }}</div>
                        <div v-if="column.getTooltip"
                             data-bs-toggle="tooltip"
                             :data-bs-html="column.tooltipHtml"
                             :data-bs-title="column.getTooltip(item)">
                          <slot :name="column.key" :item="item" :index="index">
                            {{ column.value ? column.value(item) : item[column.key] }}
                          </slot>
                        </div>
                        <div v-else>
                          <slot :name="column.key" :item="item" :index="index">
                            {{ column.value ? column.value(item) : item[column.key] }}
                          </slot>
                        </div>
                      </div>
                    </template>
                  </slot>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.scrollable-window {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Remove duplicate/conflicting styles and simplify row styling */
.data-table-container .row.mb-2:not(.header-row) .card {
  transition: background-color 0.2s ease;
}

.data-table-container .row.mb-2.row-striped:not(.header-row) .card {
  background-color: rgba(0, 0, 0, 0.05);
}

.data-table-container .row.mb-2:not(.header-row) .card:hover {
  background-color: rgba(244, 236, 192, 0.7);
}

/* Current week styling */
.data-table-container .row.mb-2.current-week-card .card {
  background-color: rgba(198, 222, 210, 0.85) !important;
}

.data-table-container .row.mb-2.current-week-card .card:hover {
  background-color: rgba(198, 222, 210, 0.95) !important;
}

/* Mobile labels */
.data-label {
  font-weight: bold;
  font-size: 0.8rem;
  margin-bottom: 0.1rem;
  color: #6c757d;
}

@media (max-width: 1199.98px) {
  .card {
    margin-bottom: 0.75rem;
  }
  
  .row > [class*="col-"] {
    margin-bottom: 0.5rem;
  }
}

/* Header styling */
.header-row .card {
  background-color: transparent;
  box-shadow: none;
}

.header-row .card-body {
  padding-left: 1.25rem;  /* Match data row padding */
  padding-right: 1.25rem;
}
</style>
