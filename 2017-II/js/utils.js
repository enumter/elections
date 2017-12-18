var templates = {}
$("script[type='text/template']").each(function() {
    templates[$(this).attr("id")] = _.template($(this).html())
})

$.fn.template = function(data) {
  var result
  this.each(function() {
    var $this = $(this),
        template
    if (!$this.data('_template_fn')) {
      template = templates[$(this).attr("id")]
      $this.data('_template_fn', function(data) {
        var target = $this.data('_template_node')
        if (target)
          target.remove()
        target = $($.parseHTML(template(data))).insertAfter($this)
        $this.data('_template_node', target)
        return target
      })
    }
  })
  result = $()
  this.each(function() {
    result = result.add($(this).data('_template_fn')(data))
  })
  return result
};


function qParams() {
    var match,
        pl     = /\+/g,  // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
        query  = window.location.search.substring(1);

    urlParams = {};
    while (match = search.exec(query))
       urlParams[decode(match[1])] = decode(match[2]);
  return urlParams
};


function draw_map(parameters){
  var st_key = parameters.state || 'gujarat'
  var color_scale = _.mapObject(color_ranges, function(v, i) {
      return d3.scaleThreshold()
        .domain(spec[st_key].vote_share)
        .range(color_ranges[i])
    })

  d3.queue()
    .defer(d3.json, st_key + "_ac_mapn.json")
    .defer(d3.csv, st_key + "2017n.csv", parseRow)
    .await(process)

  function parseRow(d) { return {
    VOTES: +d.VOTES,
    AC_NO: d.AC_NO,
    AC_NAME: d.AC_NAME,
    NAME: d.NAME,
    PARTY: d.PARTY
    };
  }

  function process(error, map, df) {
    window.df = df
    window.map = map
    function agg(v){
      v = _.sortBy(v, function(x){ return -x.VOTES} )
      total = _.reduce(v, function(m, n){ return m + n.VOTES; }, 0)
      first = _.clone(v[0])
      v = _.each(v, function(x,i) { _.extend(x, {share:x.VOTES / total * 100, rank:i+1}) })
      first.candidates = v
      first.share = first.VOTES / total * 100
      first.total = total
      return first
    }
    df2 = _.chain(df).groupBy("AC_NO").map(function(v, k){ return agg(v) } ).value()
    df2i = _.indexBy(df2, "AC_NO")
    // Party win count
    party_wins = _.chain(df).groupBy('PARTY').map(function(v, k) {
        return {
        PARTY: k,
        candidates: v.length,
        win: _.filter(v, function(x){ return x.rank == 1}).length,
        VOTES: _.reduce(v, function(m, n){ return m + n.VOTES; }, 0),
        }
      }).sortBy(function(x){ return -x.win}).value()

    total_candidates = _.reduce(party_wins, function(m, n){ return m + n.candidates; }, 0)
    total_votes = _.reduce(party_wins, function(m, n){ return m + n.VOTES; }, 0)
    _.map(party_wins, function(x) { return x.share = x.VOTES / total_votes * 100 })
    // Party-wise AC data
    //df_party = _.chain(df2).map(function(v){return _.findWhere(v.candidates, {"PARTY": _party}) }).value()
    //dfi_party = _.indexBy(df_party, "AC_NO")
    window.party_wins = party_wins
    window.total_stats = {votes: total_votes, candidates: total_candidates}
    window.df2 = df2
    window.df2i = df2i
    //window.dfi_party = dfi_party
    if (parameters.view == "map") {
      $(".map-view").show()
      $(".list-view").hide()
      mapify(map)
      $("#tpl-details").template({state: spec[st_key].alias, stats: party_wins, total_stats: total_stats, view: false})
    } else {
      $(".list-view").show()
      $(".map-view").hide()
      $('#tpl-list').template({df: df2i})
    }
  }

  var width = 400, height = 350;

  d3.select(".map-canvas svg").remove()
  var svg = d3.select(".map-canvas").append("svg")
    .attr("width", "100%")
    .attr("viewBox", "0 0 " + width + " " + height)
    .attr("preserveAspectRatio", "xMidYMin meet");

  // viewBox="0 0 750 190" width="100%" preserveAspectRatio="xMidYMin meet"

  var projection = d3.geoMercator();

  var path = d3.geoPath()
    .projection(projection)
    .pointRadius(2);

  var g = svg.append("g");

  var name, centered

  function mapify(map){
    name = Object.keys(map.objects)[0]
    var boundary = centerZoom(map);
    var geoms = drawGeoms(map);
    colorGeoms(geoms);
    metaGeoms(geoms);
    drawLabels(map, "AC_NAME");
    drawOuterBoundary(map, boundary);
  };

  function centerZoom(data){
    var o = topojson.mesh(data, data.objects[name], function(a, b) { return a === b; });

    projection
        .scale(1)
        .translate([0, 0]);

    var b = path.bounds(o),
        s = 1 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height),
        t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];

    var p = projection
        .scale(s)
        .translate(t);

    return o;
  }

  function drawGeoms(data){
    var geoms = g.selectAll(".geom")
        .data(topojson.feature(data, data.objects[name]).features)
      .enter().append("path")
        .attr("class", "geom")
        .attr("d", path)
        .style("stroke-width", "1px")
        .style("stroke", "#fff")
        .on("click", clicked);

    return geoms;
  }

  function drawLabels(data, text){
    g.selectAll(".geom-label")
      .data(topojson.feature(data, data.objects[name]).features)
    .enter().append("text")
      .attr("class", "geom-label")
      .attr("transform", function(d) { return "translate(" + path.centroid(d) + ")"; })
      .attr("dy", ".35em")
      .attr("text-anchor", "middle")
      .style("text-transform", "uppercase")
      .text(function(d) { return d.properties[text]; })
      .style("font-size", function(d) { return Math.min(12, path.measure(d) / this.getComputedTextLength()) + "px"; });
  }

  function colorGeoms(geoms) {
    geoms
      .style("fill", "#666")
      .transition()
      .duration(2000)
      .style("fill", function(d){
        return getColor(d.properties); });
  }

  function metaGeoms(geoms) {
    geoms
      .on("mouseover", function(d){
        //console.log(d.properties.AC_NAME, df2i[d.properties.AC_NO], centered);
        $("#tpl-details").template({state: spec[st_key].alias, df: df2i[d.properties.AC_NO], view: true})
      })
      .on("mouseout", function(d){
        if (!(centered)) {
          $("#tpl-details").template({state: spec[st_key].alias, stats: party_wins, total_stats: total_stats, view: false})
        }
      })
  }

  function drawOuterBoundary(data, boundary){
    g.append("path")
      .datum(boundary)
      .attr("d", path)
      .attr("class", "geom-boundary");
  }

  function getColor(v) {
    var val = df2i[v.AC_NO]
    if (val === undefined) { return "gray" }
    return (val.PARTY in color_scale)?color_scale[val.PARTY](val.share):color_scale._O_(val.share)
  }

  function getColorParty(v) {
    return (v.AC_NO in dfi_party)?color_scale[_party](dfi_party[v.AC_NO].share):""
  }

  function clicked(d) {
    var x, y, k;

    if (d && centered !== d) {
      var centroid = path.centroid(d);
      x = centroid[0];
      y = centroid[1];
      k = 4;
      centered = d;
    } else {
      x = width / 2;
      y = height / 2;
      k = 1;
      centered = null;
    }

    g.selectAll("path")
      .classed("active", centered && function(d) { return d === centered; });

    g.transition()
      .duration(750)
      .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")scale(" + k + ")translate(" + -x + "," + -y + ")")
  }

}
