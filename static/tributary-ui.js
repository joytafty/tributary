var Backbone = require("backbone");

TributaryUi = function(tributary) {
  if (!tributary.ui) {
    tributary.ui = {};
  }
  tributary.trace = false;
  tributary.hint = false;
  var parentWindow;
  if (window) {
    window.addEventListener("message", recieveMessage, false);
    function recieveMessage(event) {
      if (event.origin !== tributary._origin || !event.data) return;
      var data = event.data;
      if (data.request === "load") {
        parentWindow = event.source;
        tributary.query = data.query;
        tributary.loadGist(data.gist, _assemble);
      } else if (data.request === "save") {
        var json = serializeGist();
        event.source.postMessage({
          request: "save",
          config: json,
          salt: data.salt
        }, event.origin);
      } else if (data.request === "description") {
        tributary.__config__.set("description", data.description);
      } else if (data.request === "exitfullscreen") {
        tributary.events.trigger("fullscreen", false);
      } else if (data.request === "thumbnail") {
        var image = data.image;
        d3.select("#trib-thumbnail").attr("src", image.data.link);
        d3.select("#trib-thumbnail").style("display", "");
        tributary.__config__.set("thumbnail", image.data.link);
      }
    }
  }
  tributary.events.on("warnchanged", function() {
    if (parentWindow) parentWindow.postMessage({
      request: "warnchanged"
    }, tributary._origin);
  });
  tributary.events.on("imgur", function(img) {
    if (parentWindow) parentWindow.postMessage({
      request: "imgur",
      img: img
    }, tributary._origin);
  });
  function goFullscreen() {
    if (parentWindow) parentWindow.postMessage({
      request: "fullscreen"
    }, tributary._origin);
  }
  tributary.ui.setup = function() {
    tributary.events.on("resize", function() {
      if ($("#display").width() > 767) {
        tributary.sw = $("#display").width() - $("#panel").width();
      } else {
        tributary.sw = $("#display").width();
      }
      if ($("#container").hasClass("fullscreen")) {
        tributary.sw = $("#display").width();
      }
      tributary.sh = $("#display").height();
      tributary.events.trigger("execute");
    });
    tributary.events.trigger("resize");
  };
  function _assemble(error, ret) {
    if (error) {
      console.log("error!", error);
      return;
    }
    var config = ret.config;
    tributary.__config__ = config;
    config.contexts = [];
    var context;
    var edel;
    var editor;
    var type;
    var endpoint = config.get("endpoint");
    if (tributary.endpoint) {
      endpoint = tributary.endpoint;
    }
    if (endpoint === "delta") {
      config.set("display", "svg");
      config.set("play", true);
      config.set("loop", true);
      config.set("autoinit", true);
    } else if (endpoint === "cypress") {
      config.set("display", "canvas");
      config.set("play", true);
      config.set("autoinit", true);
    } else if (endpoint === "hourglass") {
      config.set("display", "svg");
      config.set("play", true);
      config.set("autoinit", true);
    } else if (endpoint === "curiosity") {
      config.set("display", "webgl");
      config.set("play", true);
      config.set("autoinit", true);
    } else if (endpoint === "bigfish") {
      config.set("display", "svg");
      config.set("play", true);
      config.set("autoinit", false);
      config.set("restart", true);
    } else if (endpoint === "fly") {
      config.set("display", "canvas");
      config.set("play", true);
      config.set("autoinit", false);
      config.set("restart", true);
    } else if (endpoint === "ocean") {
      config.set("display", "div");
    }
    if (!config.get("display")) {
      config.set("display", "svg");
    }
    config.set("endpoint", "");
    var edit = d3.select("#code");
    tributary.edit = edit;
    ret.models.each(function(m) {
      type = m.get("type");
      context = tributary.make_context({
        config: config,
        model: m,
        display: d3.select("#display")
      });
      if (context) {
        config.contexts.push(context);
        context.render();
        if (tributary.__mainfiles__.indexOf(m.get("filename")) < 0) {
          context.execute();
        }
        context.editor = tributary.make_editor({
          model: m,
          parent: edit
        });
        m.trigger("hide");
      }
    });
    config.contexts.forEach(function(c) {
      if (tributary.__mainfiles__.indexOf(c.model.get("filename")) >= 0) {
        c.model.trigger("show");
        tributary.autoinit = true;
        c.execute();
        tributary.autoinit = config.get("autoinit");
      }
    });
    var files_view = new tributary.FilesView({
      el: "#file-list",
      model: config
    });
    files_view.render();
    var config_view = new tributary.ConfigView({
      el: "#config",
      model: config
    });
    config_view.render();
    $("#config-toggle").on("click", function() {
      $("#config-content").toggle();
      if ($("#config-toggle").text() == "Config") {
        $("#config-toggle").text("Close Config");
      } else {
        $("#config-toggle").text("Config");
      }
    });
    $("#library-toggle").on("click", function() {
      $("#library-content").toggle();
      if ($("#library-toggle").text() == "Add libraries") {
        $("#library-toggle").text("Close libraries");
      } else {
        $("#library-toggle").text("Add libraries");
      }
    });
    function fullscreenEvent(fullscreen) {
      if (fullscreen) {
        config.set("fullscreen", true);
        $("#container").addClass("fullscreen");
        goFullscreen();
        tributary.events.trigger("resize");
      } else {
        config.set("fullscreen", false);
        $("#container").removeClass("fullscreen");
        tributary.events.trigger("resize");
      }
    }
    $("#fullscreen").on("click", function() {
      fullscreenEvent(true);
    });
    tributary.events.on("fullscreen", fullscreenEvent);
    tributary.events.trigger("fullscreen", config.get("fullscreen"));
    tributary.events.trigger("loaded");
  }
  function serializeGist() {
    var config = tributary.__config__;
    var gist = {
      description: config.get("description"),
      "public": config.get("public"),
      files: {}
    };
    var code = "";
    config.contexts.forEach(function(context) {
      code = context.model.get("code");
      if (code === "") code = "{}";
      gist.files[context.model.get("filename")] = {
        content: code
      };
    });
    if (config.todelete) {
      config.todelete.forEach(function(filename) {
        gist.files[filename] = null;
      });
    }
    gist.files["config.json"] = {
      content: JSON.stringify(config.toJSON())
    };
    return gist;
  }
  tributary.FilesView = Backbone.View.extend({
    initialize: function() {},
    render: function() {
      var that = this;
      var template = Handlebars.templates.files;
      var contexts = _.map(tributary.__config__.contexts, function(ctx) {
        return ctx.model.toJSON();
      });
      contexts = contexts.sort(function(a, b) {
        if (a.filename < b.filename) return -1;
        return 1;
      });
      var inlet = _.find(contexts, function(d) {
        return d.filename === "inlet.js" || d.filename === "inlet.coffee";
      });
      if (inlet) {
        contexts.splice(contexts.indexOf(inlet), 1);
        contexts.unshift(inlet);
      }
      $(this.el).html(template({
        contexts: contexts
      }));
      var filelist = d3.select("#file-list").selectAll("li.file");
      filelist.on("click", function(d) {
        var filename = this.dataset.filename;
        var ctx = _.find(tributary.__config__.contexts, function(d) {
          return d.model.get("filename") === filename;
        });
        that.model.trigger("hide");
        ctx.model.trigger("show");
      });
      filelist.select(".delete-file").style("z-index", 1e3).on("click", function() {
        var dataset = this.parentNode.dataset;
        var filename = dataset.filename;
        var name = dataset.filename.split(".")[0];
        tributary.__config__.unset(filename);
        var context = _.find(tributary.__config__.contexts, function(d) {
          return d.model.get("filename") === filename;
        });
        context.model.trigger("delete");
        var ind = tributary.__config__.contexts.indexOf(context);
        tributary.__config__.contexts.splice(ind, 1);
        delete context;
        if (!tributary.__config__.todelete) {
          tributary.__config__.todelete = [];
        }
        tributary.__config__.todelete.push(filename);
        d3.select(that.el).selectAll("li.file").each(function() {
          if (this.dataset.filename === filename) {
            $(this).remove();
          }
        });
        var othertab = tributary.__config__.contexts[0].model;
        othertab.trigger("show");
        d3.event.stopPropagation();
      });
      var plus = d3.select(this.el).select(".add-file").on("click", function() {
        var input = d3.select(this).select("input").style("display", "inline-block");
        input.node().focus();
        input.on("keypress", function() {
          if (d3.event.charCode === 13) {
            if (input.node().value === "") {
              return input.style("display", "none");
            }
            var context = tributary.make_context({
              filename: input.node().value,
              config: tributary.__config__
            });
            if (context) {
              tributary.__config__.contexts.push(context);
              context.render();
              context.execute();
              var editor = tributary.make_editor({
                model: context.model
              });
              context.editor = editor;
              that.$el.empty();
              that.render();
              tributary.__config__.contexts.forEach(function(c) {
                c.model.trigger("hide");
              });
              context.model.trigger("show");
              editor.cm.focus();
            } else {
              input.classed("error", true);
            }
          }
        });
      });
    }
  });
  tributary.FileView = Backbone.View.extend({
    render: function() {}
  });
  return tributary;
};