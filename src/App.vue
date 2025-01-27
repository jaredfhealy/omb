<template>
  <router-view/>
</template>

<style>
#app {
    overflow: hidden;
}

[v-cloak]>* {
    display: none
}

/* Remove the navbar's default margin-bottom and rounded borders */
.navbar {
    margin-bottom: 0;
    border-radius: 0;
}

/* Navbar styles */
#appNav .navbar-nav .nav-link,
#appNav .navbar-brand,
#appNav .dropdown-toggle {
  color: white;
}

#appNav .navbar-nav .nav-link:hover,
#appNav .dropdown-toggle:hover {
  color: rgba(255, 255, 255, 0.8);
}

/* Set height of the grid so .sidenav can be 100% (adjust as needed) */
.row.content {
    height: 450px
}

/* Set gray background color and 100% height */
.sidenav {
    padding-top: 20px;
    background-color: #f1f1f1;
    height: 100%;
}

/* Set black background color, white text and some padding */
footer {
    background-color: #555;
    color: white;
    padding: 15px;
}

/* On small screens, set height to 'auto' for sidenav and grid */
@media screen and (max-width: 767px) {
    .sidenav {
        height: auto;
        padding: 15px;
    }

    .row.content {
        height: auto;
    }
}

.modal {
    z-index: 1050;
}

.modal-dialog {
    z-index: 1055;
}

.modal-backdrop {
    z-index: 1040;
}

.dropdown-item.flex-grow-1.active {
    background-color: white;
    color: black;
}

.cursor-pointer {
    cursor: pointer;
}
</style>