<script setup>
const props = defineProps({
  columns: {
    type: Array,
    required: true
  },
  rows: {
    type: Array,
    required: true
  },
  rowKey: {
    type: Function,
    default: (_row, index) => index
  },
  tableClass: {
    type: String,
    default: 'table table-sm table-striped align-middle'
  }
})

function getCellValue(column, row) {
  if (typeof column?.value === 'function') return column.value(row)
  return row?.[column?.key]
}

function getCellClass(column, row) {
  const baseClass = column?.class || ''
  if (typeof column?.cellClass === 'function') {
    const dynamicClass = column.cellClass(row) || ''
    return `${baseClass} ${dynamicClass}`.trim()
  }
  return baseClass
}
</script>

<template>
  <div class="table-responsive">
    <table :class="tableClass">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :class="column.headerClass"
          >
            <span
              v-if="column.headerTooltip"
              style="cursor: help;"
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              :data-bs-html="column.headerTooltipHtml ? 'true' : undefined"
              :data-bs-title="column.headerTooltip"
            >
              {{ column.label }}
              <i class="bi bi-info-circle ms-1"></i>
            </span>
            <template v-else>
              {{ column.label }}
            </template>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="rowKey(row, index)">
          <td v-for="column in columns" :key="column.key" :class="getCellClass(column, row)">
            <template v-if="column.key === 'description' && row?.rollDirectionIcon && row?.rollFromText && row?.rollToText">
              {{ row.rollFromText }}
              <i :class="['bi', row.rollDirectionIcon, 'mx-1']" aria-hidden="true"></i>
              {{ row.rollToText }}
            </template>
            <template v-else>
              {{ getCellValue(column, row) }}
            </template>
          </td>
        </tr>
      </tbody>
      <tfoot v-if="$slots.footer">
        <slot name="footer" />
      </tfoot>
    </table>
  </div>
</template>
